const pool = require('../config/db');
const { logActivity } = require('../services/activityLogService');

async function getAgencies(req, res) {
    try {
        const result = await pool.query('SELECT * FROM agencies ORDER BY agency_name ASC');
        res.json({ agencies: result.rows });
    } catch (err) {
        console.error('Error fetching agencies:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
}

async function addAgency(req, res) {
    const { agency_name, contact_person, email, phone, website, notes } = req.body;
    
    if (!agency_name) {
        return res.status(400).json({ error: 'Agency name is required' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO agencies 
            (agency_name, contact_person, email, phone, website, notes) 
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [agency_name, contact_person, email, phone, website, notes]
        );
        
        const newAgency = result.rows[0];
        const username = req.session.user.username;
        await logActivity(username, 'Created Agency', 'Agency', newAgency.id, newAgency.agency_name);
        
        res.status(201).json({ agency: newAgency });
    } catch (err) {
        console.error('Error adding agency:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
}

async function updateAgency(req, res) {
    const { id } = req.params;
    const { agency_name, contact_person, email, phone, website, notes } = req.body;
    
    if (!agency_name) {
        return res.status(400).json({ error: 'Agency name is required' });
    }

    try {
        const oldAgencyRes = await pool.query('SELECT * FROM agencies WHERE id = $1', [id]);
        if (oldAgencyRes.rowCount === 0) {
            return res.status(404).json({ error: 'Agency not found' });
        }
        
        const result = await pool.query(
            `UPDATE agencies SET 
                agency_name = $1, 
                contact_person = $2, 
                email = $3, 
                phone = $4, 
                website = $5, 
                notes = $6, 
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $7 RETURNING *`,
            [agency_name, contact_person, email, phone, website, notes, id]
        );
        
        const updatedAgency = result.rows[0];
        const username = req.session.user.username;
        await logActivity(username, 'Updated Agency', 'Agency', updatedAgency.id, updatedAgency.agency_name);
        
        res.json({ agency: updatedAgency });
    } catch (err) {
        console.error('Error updating agency:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    getAgencies,
    addAgency,
    updateAgency
};
