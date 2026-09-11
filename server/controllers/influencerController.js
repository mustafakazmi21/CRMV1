// server/controllers/influencerController.js
const pool = require('../config/db');
const { logActivity } = require('../services/activityLogService');

function parseNumberOrNull(val) {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val === 'number') return Math.round(val);
    const cleaned = String(val).replace(/,/g, '').trim();
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? null : num;
}

function parseDateOrNull(val) {
    if (val === undefined || val === null || val === '') return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
}

// Get list of influencers (with pagination, search, category/status, and archive filters)
async function getInfluencers(req, res) {
    let { page = 1, limit = 50, search = '', archived = 'false', category = '', status = '', agency_id = '' } = req.query;
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 50;
    const offset = (page - 1) * limit;
    const isArchived = archived === 'true';

    try {
        let countQuery = 'SELECT COUNT(*) FROM influencers WHERE is_archived = $1';
        let countParams = [isArchived];

        let selectQuery = `
            SELECT *, COALESCE(display_name, username, '') AS influencer_name 
            FROM influencers 
            WHERE is_archived = $1
        `;
        let selectParams = [isArchived];

        if (search && search.trim() !== '') {
            const searchPattern = `%${search.trim()}%`;
            countQuery += ` AND (username ILIKE $${countParams.length + 1} OR display_name ILIKE $${countParams.length + 1} OR category ILIKE $${countParams.length + 1} OR snippet ILIKE $${countParams.length + 1} OR remarks ILIKE $${countParams.length + 1} OR source_query ILIKE $${countParams.length + 1} OR status ILIKE $${countParams.length + 1})`;
            countParams.push(searchPattern);

            selectQuery += ` AND (username ILIKE $${selectParams.length + 1} OR display_name ILIKE $${selectParams.length + 1} OR category ILIKE $${selectParams.length + 1} OR snippet ILIKE $${selectParams.length + 1} OR remarks ILIKE $${selectParams.length + 1} OR source_query ILIKE $${selectParams.length + 1} OR status ILIKE $${selectParams.length + 1})`;
            selectParams.push(searchPattern);
        }

        if (category && category.trim() !== '') {
            const catPattern = `%${category.trim()}%`;
            countQuery += ` AND category ILIKE $${countParams.length + 1}`;
            countParams.push(catPattern);
            selectQuery += ` AND category ILIKE $${selectParams.length + 1}`;
            selectParams.push(catPattern);
        }

        if (status && status.trim() !== '') {
            countQuery += ` AND status ILIKE $${countParams.length + 1}`;
            countParams.push(status.trim());
            selectQuery += ` AND status ILIKE $${selectParams.length + 1}`;
            selectParams.push(status.trim());
        }

        if (agency_id && agency_id.trim() !== '') {
            countQuery += ` AND agency_id = $${countParams.length + 1}`;
            countParams.push(parseInt(agency_id));
            selectQuery += ` AND agency_id = $${selectParams.length + 1}`;
            selectParams.push(parseInt(agency_id));
        }

        // Add sorting, limit, and offset
        selectQuery += ` ORDER BY status_timestamp DESC NULLS LAST, id DESC LIMIT $${selectParams.length + 1} OFFSET $${selectParams.length + 2}`;
        selectParams.push(limit, offset);

        const countResult = await pool.query(countQuery, countParams);
        const totalRows = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalRows / limit) || 1;

        const selectResult = await pool.query(selectQuery, selectParams);

        return res.json({
            influencers: selectResult.rows,
            pagination: {
                page,
                limit,
                totalRows,
                totalPages
            }
        });
    } catch (err) {
        console.error('Error fetching influencers:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Get single influencer detail + history
async function getInfluencerById(req, res) {
    const { id } = req.params;
    try {
        const influencerRes = await pool.query(
            "SELECT *, COALESCE(display_name, username, '') AS influencer_name FROM influencers WHERE id = $1",
            [id]
        );
        if (influencerRes.rowCount === 0) {
            return res.status(404).json({ error: 'Influencer not found' });
        }

        // Fetch activity logs for this influencer
        const logsRes = await pool.query(
            'SELECT * FROM activity_logs WHERE record_type = $1 AND record_id = $2 ORDER BY timestamp DESC',
            ['Influencer', id]
        );

        return res.json({
            influencer: influencerRes.rows[0],
            activityLogs: logsRes.rows
        });
    } catch (err) {
        console.error('Error fetching influencer details:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Create new influencer
async function createInfluencer(req, res) {
    const {
        username = '',
        remarks = '',
        instagram_url = '',
        followers,
        followers_formatted = '',
        following,
        snippet = '',
        source_query = '',
        source_url = '',
        first_seen,
        display_name = '',
        posts,
        script = '',
        status = 'New',
        status_timestamp,
        category = '',
        agency_id
    } = req.body;

    if (!username && !instagram_url && !display_name) {
        return res.status(400).json({ error: 'At least Username, Instagram URL, or Display Name is required' });
    }

    try {
        const queryText = `
            INSERT INTO influencers (
                username, remarks, instagram_url,
                followers, followers_formatted,
                following, snippet, source_query, source_url,
                first_seen, display_name, posts,
                script, status, status_timestamp,
                category, agency_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING *, COALESCE(display_name, username, '') AS influencer_name
        `;

        const values = [
            username ? String(username).trim() : null,
            remarks ? String(remarks).trim() : null,
            instagram_url ? String(instagram_url).trim() : null,
            parseNumberOrNull(followers),
            followers_formatted ? String(followers_formatted).trim() : null,
            parseNumberOrNull(following),
            snippet ? String(snippet).trim() : null,
            source_query ? String(source_query).trim() : null,
            source_url ? String(source_url).trim() : null,
            parseDateOrNull(first_seen),
            display_name ? String(display_name).trim() : null,
            parseNumberOrNull(posts),
            script ? String(script).trim() : null,
            status ? String(status).trim() : 'New',
            parseDateOrNull(status_timestamp),
            category ? String(category).trim() : null,
            agency_id ? parseInt(agency_id) : null
        ];

        const result = await pool.query(queryText, values);
        const newInfluencer = result.rows[0];
        const currentUsername = req.session && req.session.user ? req.session.user.username : 'system';

        // Log creation
        const influencerLabel = newInfluencer.display_name || newInfluencer.username || 'New Influencer';
        await logActivity(currentUsername, 'Influencer added', 'Influencer', newInfluencer.id, influencerLabel);

        return res.status(201).json(newInfluencer);
    } catch (err) {
        console.error('Error creating influencer:', err);
        return res.status(500).json({ error: 'Internal server error: ' + err.message });
    }
}

// Update influencer fields and log changes
async function updateInfluencer(req, res) {
    const { id } = req.params;

    try {
        const originalRes = await pool.query('SELECT * FROM influencers WHERE id = $1', [id]);
        if (originalRes.rowCount === 0) {
            return res.status(404).json({ error: 'Influencer not found' });
        }
        const original = originalRes.rows[0];

        const fields = [
            'username', 'remarks', 'instagram_url',
            'followers', 'followers_formatted',
            'following', 'snippet', 'source_query', 'source_url',
            'first_seen', 'display_name', 'posts',
            'script', 'status', 'status_timestamp',
            'category', 'agency_id'
        ];

        const updates = [];
        const values = [];
        let paramIdx = 1;
        const currentUsername = req.session && req.session.user ? req.session.user.username : 'system';
        const influencerLabel = original.display_name || original.username || 'Influencer';

        for (const field of fields) {
            if (req.body[field] !== undefined) {
                let newVal = req.body[field];
                if (['followers', 'following', 'posts', 'agency_id'].includes(field)) {
                    newVal = parseNumberOrNull(newVal);
                } else if (['first_seen', 'status_timestamp'].includes(field)) {
                    newVal = parseDateOrNull(newVal);
                } else {
                    newVal = newVal !== null && newVal !== undefined ? String(newVal).trim() : null;
                }

                let oldVal = original[field];
                if (['first_seen', 'status_timestamp'].includes(field) && oldVal) {
                    oldVal = new Date(oldVal).toISOString();
                }

                if (String(newVal || '') !== String(oldVal || '')) {
                    updates.push(`${field} = $${paramIdx}`);
                    values.push(newVal);
                    paramIdx++;

                    // Log field-level edit
                    await logActivity(currentUsername, 'Influencer edited', 'Influencer', id, influencerLabel, field, String(oldVal || ''), String(newVal || ''));
                }
            }
        }

        if (updates.length === 0) {
            return res.json(original); // No changes made
        }

        // Add updated_at timestamp
        updates.push(`updated_at = NOW()`);

        values.push(id);
        const queryText = `
            UPDATE influencers
            SET ${updates.join(', ')}
            WHERE id = $${paramIdx}
            RETURNING *, COALESCE(display_name, username, '') AS influencer_name
        `;

        const result = await pool.query(queryText, values);
        return res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating influencer:', err);
        return res.status(500).json({ error: 'Internal server error: ' + err.message });
    }
}

// Archive influencer
async function archiveInfluencer(req, res) {
    const { id } = req.params;
    try {
        const influencerRes = await pool.query('SELECT * FROM influencers WHERE id = $1', [id]);
        if (influencerRes.rowCount === 0) {
            return res.status(404).json({ error: 'Influencer not found' });
        }
        const influencer = influencerRes.rows[0];
        const influencerLabel = influencer.display_name || influencer.username || 'Influencer';

        await pool.query('UPDATE influencers SET is_archived = true, updated_at = NOW() WHERE id = $1', [id]);
        const currentUsername = req.session && req.session.user ? req.session.user.username : 'system';

        // Log archive action
        await logActivity(currentUsername, 'Influencer archived', 'Influencer', id, influencerLabel);

        return res.json({ success: true, message: 'Influencer archived successfully' });
    } catch (err) {
        console.error('Error archiving influencer:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Unarchive influencer
async function unarchiveInfluencer(req, res) {
    const { id } = req.params;
    try {
        const influencerRes = await pool.query('SELECT * FROM influencers WHERE id = $1', [id]);
        if (influencerRes.rowCount === 0) {
            return res.status(404).json({ error: 'Influencer not found' });
        }
        const influencer = influencerRes.rows[0];
        const influencerLabel = influencer.display_name || influencer.username || 'Influencer';

        await pool.query('UPDATE influencers SET is_archived = false, updated_at = NOW() WHERE id = $1', [id]);
        const currentUsername = req.session && req.session.user ? req.session.user.username : 'system';

        // Log unarchive action
        await logActivity(currentUsername, 'Influencer unarchived', 'Influencer', id, influencerLabel);

        return res.json({ success: true, message: 'Influencer unarchived successfully' });
    } catch (err) {
        console.error('Error unarchiving influencer:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    getInfluencers,
    getInfluencerById,
    createInfluencer,
    updateInfluencer,
    archiveInfluencer,
    unarchiveInfluencer
};
