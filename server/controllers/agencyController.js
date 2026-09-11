// server/controllers/agencyController.js
const pool = require('../config/db');
const { logActivity } = require('../services/activityLogService');

// Get list of agencies (with pagination, search, status, and archive filters)
async function getAgencies(req, res) {
    let { page = 1, limit = 50, search = '', archived = 'false', showArchived = 'false', status = '' } = req.query;
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 50;
    const offset = (page - 1) * limit;
    const isArchived = (archived === 'true' || showArchived === 'true' || archived === true || showArchived === true);

    try {
        let countQuery = 'SELECT COUNT(*) FROM agencies WHERE is_archived = $1';
        let countParams = [isArchived];

        let selectQuery = 'SELECT * FROM agencies WHERE is_archived = $1';
        let selectParams = [isArchived];

        if (search && search.trim() !== '') {
            const searchPattern = `%${search.trim()}%`;
            const searchClause = ` AND (
                company_name ILIKE $${countParams.length + 1} OR 
                website ILIKE $${countParams.length + 1} OR 
                email ILIKE $${countParams.length + 1} OR 
                phone ILIKE $${countParams.length + 1} OR 
                address ILIKE $${countParams.length + 1} OR 
                status ILIKE $${countParams.length + 1} OR
                linkedin ILIKE $${countParams.length + 1} OR
                instagram ILIKE $${countParams.length + 1} OR
                facebook ILIKE $${countParams.length + 1} OR
                twitter_x ILIKE $${countParams.length + 1} OR
                youtube ILIKE $${countParams.length + 1}
            )`;
            countQuery += searchClause;
            countParams.push(searchPattern);

            selectQuery += searchClause;
            selectParams.push(searchPattern);
        }

        if (status && status.trim() !== '') {
            countQuery += ` AND status ILIKE $${countParams.length + 1}`;
            countParams.push(status.trim());
            selectQuery += ` AND status ILIKE $${selectParams.length + 1}`;
            selectParams.push(status.trim());
        }

        // Add sorting, limit, and offset
        selectQuery += ` ORDER BY id ASC LIMIT $${selectParams.length + 1} OFFSET $${selectParams.length + 2}`;
        selectParams.push(limit, offset);

        const countResult = await pool.query(countQuery, countParams);
        const totalRows = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalRows / limit) || 1;

        const selectResult = await pool.query(selectQuery, selectParams);

        const agencies = selectResult.rows.map(row => ({
            ...row,
            companyName: row.company_name,
            twitterX: row.twitter_x
        }));

        return res.json({
            agencies,
            pagination: {
                page,
                limit,
                totalRows,
                totalPages
            }
        });
    } catch (err) {
        console.error('Error fetching agencies:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Get single agency detail + history logs
async function getAgencyById(req, res) {
    const { id } = req.params;
    try {
        const agencyRes = await pool.query('SELECT * FROM agencies WHERE id = $1', [id]);
        if (agencyRes.rowCount === 0) {
            return res.status(404).json({ error: 'Agency not found' });
        }

        // Fetch activity logs for this agency
        const logsRes = await pool.query(
            'SELECT * FROM activity_logs WHERE record_type = $1 AND record_id = $2 ORDER BY timestamp DESC',
            ['Agency', id]
        );

        const agencyRow = agencyRes.rows[0];
        const agency = {
            ...agencyRow,
            companyName: agencyRow.company_name,
            twitterX: agencyRow.twitter_x
        };

        return res.json({
            agency,
            activityLogs: logsRes.rows
        });
    } catch (err) {
        console.error('Error fetching agency details:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Create new agency
async function createAgency(req, res) {
    const {
        company_name = '',
        website = '',
        linkedin = '',
        instagram = '',
        facebook = '',
        twitter_x = '',
        youtube = '',
        phone = '',
        email = '',
        address = '',
        status = 'NO_DATA'
    } = req.body;

    if (!company_name && !website) {
        return res.status(400).json({ error: 'Company Name or Website is required' });
    }

    try {
        const queryText = `
            INSERT INTO agencies (
                company_name, website, linkedin, instagram,
                facebook, twitter_x, youtube, phone,
                email, address, status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `;

        const values = [
            company_name ? String(company_name).trim() : null,
            website ? String(website).trim() : null,
            linkedin ? String(linkedin).trim() : null,
            instagram ? String(instagram).trim() : null,
            facebook ? String(facebook).trim() : null,
            twitter_x ? String(twitter_x).trim() : null,
            youtube ? String(youtube).trim() : null,
            phone ? String(phone).trim() : null,
            email ? String(email).trim() : null,
            address ? String(address).trim() : null,
            status ? String(status).trim() : 'NO_DATA'
        ];

        const result = await pool.query(queryText, values);
        const newAgency = result.rows[0];
        const currentUsername = req.session && req.session.user ? req.session.user.username : 'system';

        // Log creation
        const agencyLabel = newAgency.company_name || newAgency.website || 'New Agency';
        await logActivity(currentUsername, 'Agency added', 'Agency', newAgency.id, agencyLabel);

        return res.status(201).json({ agency: newAgency });
    } catch (err) {
        console.error('Error creating agency:', err);
        return res.status(500).json({ error: 'Internal server error: ' + err.message });
    }
}

// Update agency fields and log field-level changes
async function updateAgency(req, res) {
    const { id } = req.params;

    try {
        const originalRes = await pool.query('SELECT * FROM agencies WHERE id = $1', [id]);
        if (originalRes.rowCount === 0) {
            return res.status(404).json({ error: 'Agency not found' });
        }
        const original = originalRes.rows[0];

        const fields = [
            'company_name', 'website', 'linkedin', 'instagram',
            'facebook', 'twitter_x', 'youtube', 'phone',
            'email', 'address', 'status'
        ];

        const updates = [];
        const values = [];
        let paramIdx = 1;
        const currentUsername = req.session && req.session.user ? req.session.user.username : 'system';
        const agencyLabel = original.company_name || original.website || 'Agency';

        for (const field of fields) {
            if (req.body[field] !== undefined) {
                let newVal = req.body[field];
                newVal = newVal !== null && newVal !== undefined ? String(newVal).trim() : null;

                let oldVal = original[field];
                oldVal = oldVal !== null && oldVal !== undefined ? String(oldVal).trim() : null;

                if (String(newVal || '') !== String(oldVal || '')) {
                    updates.push(`${field} = $${paramIdx}`);
                    values.push(newVal);
                    paramIdx++;

                    // Log field-level edit
                    await logActivity(currentUsername, 'Agency edited', 'Agency', id, agencyLabel, field, String(oldVal || ''), String(newVal || ''));
                }
            }
        }

        if (updates.length === 0) {
            return res.json({ agency: original }); // No changes made
        }

        // Add updated_at timestamp
        updates.push(`updated_at = NOW()`);

        values.push(id);
        const queryText = `
            UPDATE agencies
            SET ${updates.join(', ')}
            WHERE id = $${paramIdx}
            RETURNING *
        `;

        const result = await pool.query(queryText, values);
        return res.json({ agency: result.rows[0] });
    } catch (err) {
        console.error('Error updating agency:', err);
        return res.status(500).json({ error: 'Internal server error: ' + err.message });
    }
}

// Archive agency
async function archiveAgency(req, res) {
    const { id } = req.params;
    try {
        const agencyRes = await pool.query('SELECT * FROM agencies WHERE id = $1', [id]);
        if (agencyRes.rowCount === 0) {
            return res.status(404).json({ error: 'Agency not found' });
        }
        const agency = agencyRes.rows[0];
        const agencyLabel = agency.company_name || agency.website || 'Agency';

        await pool.query('UPDATE agencies SET is_archived = true, updated_at = NOW() WHERE id = $1', [id]);
        const currentUsername = req.session && req.session.user ? req.session.user.username : 'system';

        // Log archive action
        await logActivity(currentUsername, 'Agency archived', 'Agency', id, agencyLabel);

        return res.json({ success: true, message: 'Agency archived successfully' });
    } catch (err) {
        console.error('Error archiving agency:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Unarchive agency
async function unarchiveAgency(req, res) {
    const { id } = req.params;
    try {
        const agencyRes = await pool.query('SELECT * FROM agencies WHERE id = $1', [id]);
        if (agencyRes.rowCount === 0) {
            return res.status(404).json({ error: 'Agency not found' });
        }
        const agency = agencyRes.rows[0];
        const agencyLabel = agency.company_name || agency.website || 'Agency';

        await pool.query('UPDATE agencies SET is_archived = false, updated_at = NOW() WHERE id = $1', [id]);
        const currentUsername = req.session && req.session.user ? req.session.user.username : 'system';

        // Log unarchive action
        await logActivity(currentUsername, 'Agency unarchived', 'Agency', id, agencyLabel);

        return res.json({ success: true, message: 'Agency unarchived successfully' });
    } catch (err) {
        console.error('Error unarchiving agency:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    getAgencies,
    getAgencyById,
    createAgency,
    updateAgency,
    archiveAgency,
    unarchiveAgency
};

