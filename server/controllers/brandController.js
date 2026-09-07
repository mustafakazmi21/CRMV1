// server/controllers/brandController.js
const pool = require('../config/db');
const { logActivity } = require('../services/activityLogService');

// Get list of brands (with pagination, search, and archive filters)
async function getBrands(req, res) {
    let { page = 1, limit = 50, search = '', archived = 'false', category = '', location = '', agency_id = '' } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;
    const isArchived = archived === 'true';

    try {
        let countQuery = 'SELECT COUNT(*) FROM brands WHERE is_archived = $1';
        let countParams = [isArchived];

        let selectQuery = 'SELECT * FROM brands WHERE is_archived = $1';
        let selectParams = [isArchived];

        if (search && search.trim() !== '') {
            const searchPattern = `%${search.trim()}%`;
            countQuery += ` AND (brand_name ILIKE $${countParams.length + 1} OR category ILIKE $${countParams.length + 1} OR brand_focus ILIKE $${countParams.length + 1} OR founder_names ILIKE $${countParams.length + 1} OR headquarter ILIKE $${countParams.length + 1})`;
            countParams.push(searchPattern);

            selectQuery += ` AND (brand_name ILIKE $${selectParams.length + 1} OR category ILIKE $${selectParams.length + 1} OR brand_focus ILIKE $${selectParams.length + 1} OR founder_names ILIKE $${selectParams.length + 1} OR headquarter ILIKE $${selectParams.length + 1})`;
            selectParams.push(searchPattern);
        }
        
        if (category && category.trim() !== '') {
            const catPattern = `%${category.trim()}%`;
            countQuery += ` AND category ILIKE $${countParams.length + 1}`;
            countParams.push(catPattern);
            selectQuery += ` AND category ILIKE $${selectParams.length + 1}`;
            selectParams.push(catPattern);
        }

        if (location && location.trim() !== '') {
            const locPattern = `%${location.trim()}%`;
            countQuery += ` AND headquarter ILIKE $${countParams.length + 1}`;
            countParams.push(locPattern);
            selectQuery += ` AND headquarter ILIKE $${selectParams.length + 1}`;
            selectParams.push(locPattern);
        }

        if (agency_id && agency_id.trim() !== '') {
            countQuery += ` AND agency_id = $${countParams.length + 1}`;
            countParams.push(agency_id);
            selectQuery += ` AND agency_id = $${selectParams.length + 1}`;
            selectParams.push(agency_id);
        }

        // Add sorting, limit, and offset
        selectQuery += ` ORDER BY brand_name ASC LIMIT $${selectParams.length + 1} OFFSET $${selectParams.length + 2}`;
        selectParams.push(limit, offset);

        const countResult = await pool.query(countQuery, countParams);
        const totalRows = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalRows / limit);

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
        const brandRes = await pool.query('SELECT * FROM brands WHERE id = $1', [id]);
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
    const fields = [
        'brand_name', 'founded_year', 'category', 'brand_focus', 'founder_names',
        'revenue', 'revenue_year', 'last_funding_amount', 'last_funding_data', 'last_funding_date',
        'headquarter', 'main_geography_outreach', 'linkedin', 'how_many_employees',
        'marketing_head', 'marketing_mail_id', 'sales_head', 'sales_head_mail',
        'content_marketing_head', 'content_marketing_head_mail_id', 'company_phone', 'company_url',
        'facebook', 'instagram', 'youtube', 'twitter', 'main_influencer_platform', 'web_traffic'
    ];

    const values = [];
    const columns = [];
    const placeholders = [];

    fields.forEach((field, index) => {
        const val = req.body[field] !== undefined ? String(req.body[field]).trim() : '';
        columns.push(field);
        values.push(val);
        placeholders.push(`$${index + 1}`);
    });

    if (!req.body.brand_name || String(req.body.brand_name).trim() === '') {
        return res.status(400).json({ error: 'Brand name is required' });
    }

    try {
        const queryText = `
            INSERT INTO brands (${columns.join(', ')})
            VALUES (${placeholders.join(', ')})
            RETURNING *
        `;

        const result = await pool.query(queryText, values);
        const newBrand = result.rows[0];
        const username = req.session.user.username;

        // Log creation
        await logActivity(username, 'Brand added', 'Brand', newBrand.id, newBrand.brand_name);

        return res.status(201).json(newBrand);
    } catch (err) {
        console.error('Error creating brand:', err);
        return res.status(500).json({ error: 'Internal server error' });
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
            'brand_name', 'founded_year', 'category', 'brand_focus', 'founder_names',
            'revenue', 'revenue_year', 'last_funding_amount', 'last_funding_data', 'last_funding_date',
            'headquarter', 'main_geography_outreach', 'linkedin', 'how_many_employees',
            'marketing_head', 'marketing_mail_id', 'sales_head', 'sales_head_mail',
            'content_marketing_head', 'content_marketing_head_mail_id', 'company_phone', 'company_url',
            'facebook', 'instagram', 'youtube', 'twitter', 'main_influencer_platform', 'web_traffic'
        ];

        const updates = [];
        const values = [];
        let paramIdx = 1;
        const username = req.session.user.username;

        for (const field of fields) {
            if (req.body[field] !== undefined) {
                const newVal = req.body[field] === null ? '' : String(req.body[field]).trim();
                const oldVal = original[field] === null ? '' : String(original[field]).trim();

                if (newVal !== oldVal) {
                    updates.push(`${field} = $${paramIdx}`);
                    values.push(newVal);
                    paramIdx++;
                    
                    // Log field-level edit
                    await logActivity(username, 'Brand edited', 'Brand', id, original.brand_name, field, oldVal, newVal);
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
            RETURNING *
        `;

        const result = await pool.query(queryText, values);
        return res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating brand:', err);
        return res.status(500).json({ error: 'Internal server error' });
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

        await pool.query('UPDATE brands SET is_archived = true, updated_at = NOW() WHERE id = $1', [id]);
        const username = req.session.user.username;

        // Log archive action
        await logActivity(username, 'Brand archived', 'Brand', id, brand.brand_name);

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

        await pool.query('UPDATE brands SET is_archived = false, updated_at = NOW() WHERE id = $1', [id]);
        const username = req.session.user.username;

        // Log unarchive action
        await logActivity(username, 'Brand unarchived', 'Brand', id, brand.brand_name);

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
