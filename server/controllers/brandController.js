// server/controllers/brandController.js
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

// Get list of brands (with pagination, search, and archive filters)
async function getBrands(req, res) {
    let { page = 1, limit = 50, search = '', archived = 'false', status = '', agency_id = '' } = req.query;
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 50;
    const offset = (page - 1) * limit;
    const isArchived = archived === 'true';

    try {
        let countQuery = 'SELECT COUNT(*) FROM brands WHERE is_archived = $1';
        let countParams = [isArchived];

        let selectQuery = `
            SELECT *, COALESCE(display_name, username, '') AS brand_name 
            FROM brands 
            WHERE is_archived = $1
        `;
        let selectParams = [isArchived];

        if (search && search.trim() !== '') {
            const searchPattern = `%${search.trim()}%`;
            countQuery += ` AND (username ILIKE $${countParams.length + 1} OR display_name ILIKE $${countParams.length + 1} OR snippet ILIKE $${countParams.length + 1} OR source_query ILIKE $${countParams.length + 1} OR status ILIKE $${countParams.length + 1} OR message_received ILIKE $${countParams.length + 1})`;
            countParams.push(searchPattern);

            selectQuery += ` AND (username ILIKE $${selectParams.length + 1} OR display_name ILIKE $${selectParams.length + 1} OR snippet ILIKE $${selectParams.length + 1} OR source_query ILIKE $${selectParams.length + 1} OR status ILIKE $${selectParams.length + 1} OR message_received ILIKE $${selectParams.length + 1})`;
            selectParams.push(searchPattern);
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
            brands: selectResult.rows,
            pagination: {
                page,
                limit,
                totalRows,
                totalPages
            }
        });
    } catch (err) {
        console.error('Error fetching brands:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Get single brand detail + history
async function getBrandById(req, res) {
    const { id } = req.params;
    try {
        const brandRes = await pool.query(
            "SELECT *, COALESCE(display_name, username, '') AS brand_name FROM brands WHERE id = $1", 
            [id]
        );
        if (brandRes.rowCount === 0) {
            return res.status(404).json({ error: 'Brand not found' });
        }

        // Fetch activity logs for this brand
        const logsRes = await pool.query(
            'SELECT * FROM activity_logs WHERE record_type = $1 AND record_id = $2 ORDER BY timestamp DESC',
            ['Brand', id]
        );

        return res.json({
            brand: brandRes.rows[0],
            activityLogs: logsRes.rows
        });
    } catch (err) {
        console.error('Error fetching brand details:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Create new brand
async function createBrand(req, res) {
    const {
        username = '',
        instagram_url = '',
        display_name = '',
        followers,
        followers_formatted = '',
        following,
        following_formatted = '',
        posts,
        posts_formatted = '',
        snippet = '',
        source_query = '',
        source_url = '',
        first_seen,
        script = '',
        status = 'New',
        message_received = '',
        status_timestamp,
        agency_id
    } = req.body;

    if (!username && !instagram_url && !display_name) {
        return res.status(400).json({ error: 'At least Username, Instagram URL, or Display Name is required' });
    }

    try {
        const queryText = `
            INSERT INTO brands (
                username, instagram_url, display_name,
                followers, followers_formatted,
                following, following_formatted,
                posts, posts_formatted,
                snippet, source_query, source_url,
                first_seen, script, status,
                message_received, status_timestamp, agency_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            RETURNING *, COALESCE(display_name, username, '') AS brand_name
        `;

        const values = [
            username ? String(username).trim() : null,
            instagram_url ? String(instagram_url).trim() : null,
            display_name ? String(display_name).trim() : null,
            parseNumberOrNull(followers),
            followers_formatted ? String(followers_formatted).trim() : null,
            parseNumberOrNull(following),
            following_formatted ? String(following_formatted).trim() : null,
            parseNumberOrNull(posts),
            posts_formatted ? String(posts_formatted).trim() : null,
            snippet ? String(snippet).trim() : null,
            source_query ? String(source_query).trim() : null,
            source_url ? String(source_url).trim() : null,
            parseDateOrNull(first_seen),
            script ? String(script).trim() : null,
            status ? String(status).trim() : 'New',
            message_received ? String(message_received).trim() : null,
            parseDateOrNull(status_timestamp),
            agency_id ? parseInt(agency_id) : null
        ];

        const result = await pool.query(queryText, values);
        const newBrand = result.rows[0];
        const currentUsername = req.session && req.session.user ? req.session.user.username : 'system';

        // Log creation
        const brandLabel = newBrand.display_name || newBrand.username || 'New Brand';
        await logActivity(currentUsername, 'Brand added', 'Brand', newBrand.id, brandLabel);

        return res.status(201).json(newBrand);
    } catch (err) {
        console.error('Error creating brand:', err);
        return res.status(500).json({ error: 'Internal server error: ' + err.message });
    }
}

// Update brand fields and log changes
async function updateBrand(req, res) {
    const { id } = req.params;
    
    try {
        const originalRes = await pool.query('SELECT * FROM brands WHERE id = $1', [id]);
        if (originalRes.rowCount === 0) {
            return res.status(404).json({ error: 'Brand not found' });
        }
        const original = originalRes.rows[0];

        const fields = [
            'username', 'instagram_url', 'display_name',
            'followers', 'followers_formatted',
            'following', 'following_formatted',
            'posts', 'posts_formatted',
            'snippet', 'source_query', 'source_url',
            'first_seen', 'script', 'status',
            'message_received', 'status_timestamp', 'agency_id'
        ];

        const updates = [];
        const values = [];
        let paramIdx = 1;
        const currentUsername = req.session && req.session.user ? req.session.user.username : 'system';
        const brandLabel = original.display_name || original.username || 'Brand';

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
                    await logActivity(currentUsername, 'Brand edited', 'Brand', id, brandLabel, field, String(oldVal || ''), String(newVal || ''));
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
            UPDATE brands
            SET ${updates.join(', ')}
            WHERE id = $${paramIdx}
            RETURNING *, COALESCE(display_name, username, '') AS brand_name
        `;

        const result = await pool.query(queryText, values);
        return res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating brand:', err);
        return res.status(500).json({ error: 'Internal server error: ' + err.message });
    }
}

// Archive brand
async function archiveBrand(req, res) {
    const { id } = req.params;
    try {
        const brandRes = await pool.query('SELECT * FROM brands WHERE id = $1', [id]);
        if (brandRes.rowCount === 0) {
            return res.status(404).json({ error: 'Brand not found' });
        }
        const brand = brandRes.rows[0];
        const brandLabel = brand.display_name || brand.username || 'Brand';

        await pool.query('UPDATE brands SET is_archived = true, updated_at = NOW() WHERE id = $1', [id]);
        const currentUsername = req.session && req.session.user ? req.session.user.username : 'system';

        // Log archive action
        await logActivity(currentUsername, 'Brand archived', 'Brand', id, brandLabel);

        return res.json({ success: true, message: 'Brand archived successfully' });
    } catch (err) {
        console.error('Error archiving brand:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Unarchive brand
async function unarchiveBrand(req, res) {
    const { id } = req.params;
    try {
        const brandRes = await pool.query('SELECT * FROM brands WHERE id = $1', [id]);
        if (brandRes.rowCount === 0) {
            return res.status(404).json({ error: 'Brand not found' });
        }
        const brand = brandRes.rows[0];
        const brandLabel = brand.display_name || brand.username || 'Brand';

        await pool.query('UPDATE brands SET is_archived = false, updated_at = NOW() WHERE id = $1', [id]);
        const currentUsername = req.session && req.session.user ? req.session.user.username : 'system';

        // Log unarchive action
        await logActivity(currentUsername, 'Brand unarchived', 'Brand', id, brandLabel);

        return res.json({ success: true, message: 'Brand unarchived successfully' });
    } catch (err) {
        console.error('Error unarchiving brand:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    getBrands,
    getBrandById,
    createBrand,
    updateBrand,
    archiveBrand,
    unarchiveBrand
};
