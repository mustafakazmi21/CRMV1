// server/controllers/influencerController.js
const pool = require('../config/db');
const { logActivity } = require('../services/activityLogService');

// Get list of influencers
async function getInfluencers(req, res) {
    let { page = 1, limit = 50, search = '', archived = 'false', location = '', lead_by = '' } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;
    const isArchived = archived === 'true';

    try {
        let countQuery = 'SELECT COUNT(*) FROM influencers WHERE is_archived = $1';
        let countParams = [isArchived];

        let selectQuery = 'SELECT * FROM influencers WHERE is_archived = $1';
        let selectParams = [isArchived];

        if (search && search.trim() !== '') {
            const searchPattern = `%${search.trim()}%`;
            countQuery += ` AND (influencer_name ILIKE $${countParams.length + 1} OR location ILIKE $${countParams.length + 1} OR lead_by ILIKE $${countParams.length + 1} OR content_why_this_person ILIKE $${countParams.length + 1})`;
            countParams.push(searchPattern);

            selectQuery += ` AND (influencer_name ILIKE $${selectParams.length + 1} OR location ILIKE $${selectParams.length + 1} OR lead_by ILIKE $${selectParams.length + 1} OR content_why_this_person ILIKE $${selectParams.length + 1})`;
            selectParams.push(searchPattern);
        }
        
        if (location && location.trim() !== '') {
            const locPattern = `%${location.trim()}%`;
            countQuery += ` AND location ILIKE $${countParams.length + 1}`;
            countParams.push(locPattern);
            selectQuery += ` AND location ILIKE $${selectParams.length + 1}`;
            selectParams.push(locPattern);
        }

        if (lead_by && lead_by.trim() !== '') {
            const leadPattern = `%${lead_by.trim()}%`;
            countQuery += ` AND lead_by ILIKE $${countParams.length + 1}`;
            countParams.push(leadPattern);
            selectQuery += ` AND lead_by ILIKE $${selectParams.length + 1}`;
            selectParams.push(leadPattern);
        }

        // Add sorting, limit, and offset
        selectQuery += ` ORDER BY influencer_name ASC LIMIT $${selectParams.length + 1} OFFSET $${selectParams.length + 2}`;
        selectParams.push(limit, offset);

        const countResult = await pool.query(countQuery, countParams);
        const totalRows = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalRows / limit);

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

// Get single influencer details + logs
async function getInfluencerById(req, res) {
    const { id } = req.params;
    try {
        const influencerRes = await pool.query('SELECT * FROM influencers WHERE id = $1', [id]);
        if (influencerRes.rowCount === 0) {
            return res.status(404).json({ error: 'Influencer not found' });
        }

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
    const { influencer_name, lead_by, content_why_this_person, instagram_url, followers, script, comment_average, send_date } = req.body;

    if (!influencer_name || String(influencer_name).trim() === '') {
        return res.status(400).json({ error: 'Influencer name is required' });
    }

    const cleanSendDate = send_date || null;

    try {
        const queryText = `
            INSERT INTO influencers (
                influencer_name, lead_by, content_why_this_person, instagram_url,
                followers, script, comment_average, send_date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;

        const result = await pool.query(queryText, [
            String(influencer_name).trim(),
            lead_by !== undefined ? String(lead_by).trim() : '',
            content_why_this_person !== undefined ? String(content_why_this_person).trim() : '',
            instagram_url !== undefined ? String(instagram_url).trim() : '',
            followers !== undefined ? String(followers).trim() : '',
            script !== undefined ? String(script).trim() : '',
            comment_average !== undefined ? String(comment_average).trim() : '',
            cleanSendDate
        ]);

        const newInfluencer = result.rows[0];
        const username = req.session.user.username;

        // Log creation
        await logActivity(username, 'Influencer added', 'Influencer', newInfluencer.id, newInfluencer.influencer_name);

        return res.status(201).json(newInfluencer);
    } catch (err) {
        console.error('Error creating influencer:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Update influencer fields and log edits
async function updateInfluencer(req, res) {
    const { id } = req.params;

    try {
        const originalRes = await pool.query('SELECT * FROM influencers WHERE id = $1', [id]);
        if (originalRes.rowCount === 0) {
            return res.status(404).json({ error: 'Influencer not found' });
        }
        const original = originalRes.rows[0];

        const fields = [
            'influencer_name', 'lead_by', 'content_why_this_person', 'instagram_url',
            'followers', 'script', 'comment_average', 'send_date'
        ];

        const updates = [];
        const values = [];
        let paramIdx = 1;
        const username = req.session.user.username;

        for (const field of fields) {
            if (req.body[field] !== undefined) {
                let newVal = req.body[field];
                let oldVal = original[field];

                // Normalize date field comparison
                if (field === 'send_date') {
                    if (newVal) newVal = new Date(newVal).toISOString().split('T')[0];
                    if (oldVal) oldVal = new Date(oldVal).toISOString().split('T')[0];
                }

                newVal = newVal === null ? '' : String(newVal).trim();
                oldVal = oldVal === null ? '' : String(oldVal).trim();

                if (newVal !== oldVal) {
                    updates.push(`${field} = $${paramIdx}`);
                    values.push(newVal === '' ? null : newVal);
                    paramIdx++;

                    // Log field-level edit
                    await logActivity(username, 'Influencer edited', 'Influencer', id, original.influencer_name, field, oldVal, newVal);
                }
            }
        }

        if (updates.length === 0) {
            return res.json(original);
        }

        updates.push(`updated_at = NOW()`);
        values.push(id);

        const queryText = `
            UPDATE influencers
            SET ${updates.join(', ')}
            WHERE id = $${paramIdx}
            RETURNING *
        `;

        const result = await pool.query(queryText, values);
        return res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating influencer:', err);
        return res.status(500).json({ error: 'Internal server error' });
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

        await pool.query('UPDATE influencers SET is_archived = true, updated_at = NOW() WHERE id = $1', [id]);
        const username = req.session.user.username;

        await logActivity(username, 'Influencer archived', 'Influencer', id, influencer.influencer_name);

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

        await pool.query('UPDATE influencers SET is_archived = false, updated_at = NOW() WHERE id = $1', [id]);
        const username = req.session.user.username;

        await logActivity(username, 'Influencer unarchived', 'Influencer', id, influencer.influencer_name);

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
