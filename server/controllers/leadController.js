// server/controllers/leadController.js
const pool = require('../config/db');
const { logActivity } = require('../services/activityLogService');

async function getLeads(req, res) {
    const { role, id: userId } = req.session.user;
    let { page = 1, limit = 50, search = '', filter = 'all', status = '', temperature = '', location = '', dateFrom = '', dateTo = '', assignedTo = '' } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    try {
        let whereClauses = ['l.is_archived = false'];
        let params = [];
        let paramIdx = 1;

        // If Employee, restrict view to only their assigned leads
        if (role === 'EMPLOYEE') {
            whereClauses.push(`l.assigned_to = $${paramIdx}`);
            params.push(userId);
            paramIdx++;
        } else if (role === 'ADMIN' && assignedTo) {
            whereClauses.push(`l.assigned_to = $${paramIdx}`);
            params.push(parseInt(assignedTo));
            paramIdx++;
        }

        // Apply quick filters
        if (filter === 'follow-ups-due') {
            whereClauses.push(`l.next_follow_up_date <= CURRENT_DATE`);
        }

        if (status) {
            whereClauses.push(`l.status = $${paramIdx}`);
            params.push(status);
            paramIdx++;
        }

        if (temperature) {
            whereClauses.push(`l.temperature = $${paramIdx}`);
            params.push(temperature);
            paramIdx++;
        }

        if (location) {
            const locPattern = `%${location.trim()}%`;
            whereClauses.push(`(b.snippet ILIKE $${paramIdx} OR i.category ILIKE $${paramIdx} OR i.snippet ILIKE $${paramIdx})`);
            params.push(locPattern);
            paramIdx++;
        }

        if (dateFrom) {
            whereClauses.push(`l.created_at >= $${paramIdx}`);
            params.push(dateFrom);
            paramIdx++;
        }
        if (dateTo) {
            whereClauses.push(`l.created_at <= $${paramIdx}`);
            params.push(dateTo);
            paramIdx++;
        }

        if (search && search.trim() !== '') {
            const searchPattern = `%${search.trim()}%`;
            whereClauses.push(`(b.display_name ILIKE $${paramIdx} OR b.username ILIKE $${paramIdx} OR i.display_name ILIKE $${paramIdx} OR i.username ILIKE $${paramIdx} OR a.company_name ILIKE $${paramIdx} OR a.website ILIKE $${paramIdx})`);
            params.push(searchPattern);
            paramIdx++;
        }

        if (location && location.trim() !== '') {
            const locPattern = `%${location.trim()}%`;
            whereClauses.push(`(b.snippet ILIKE $${paramIdx} OR i.category ILIKE $${paramIdx} OR i.snippet ILIKE $${paramIdx} OR a.address ILIKE $${paramIdx})`);
            params.push(locPattern);
            paramIdx++;
        }

        const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

        // Count query
        const countQuery = `
            SELECT COUNT(*) 
            FROM leads l
            LEFT JOIN brands b ON l.brand_id = b.id
            LEFT JOIN influencers i ON l.influencer_id = i.id
            LEFT JOIN agencies a ON l.agency_id = a.id
            ${whereStr}
        `;
        const countResult = await pool.query(countQuery, params);
        const totalRows = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalRows / limit);

        // Select query
        let orderClause = 'ORDER BY l.updated_at DESC';
        if (filter === 'follow-ups-due') {
            orderClause = 'ORDER BY l.next_follow_up_date ASC';
        }

        const selectQuery = `
            SELECT l.*, 
                   COALESCE(b.display_name, b.username, '') as brand_name, 
                   b.snippet as brand_category, 
                   b.instagram_url as brand_url,
                   COALESCE(i.display_name, i.username, '') as influencer_name, i.followers as influencer_followers, i.instagram_url as influencer_url,
                   a.company_name as agency_name, a.website as agency_website, a.phone as agency_phone, a.email as agency_email, a.status as agency_status, a.address as agency_address,
                   u.username as assigned_username
            FROM leads l
            LEFT JOIN brands b ON l.brand_id = b.id
            LEFT JOIN influencers i ON l.influencer_id = i.id
            LEFT JOIN agencies a ON l.agency_id = a.id
            LEFT JOIN users u ON l.assigned_to = u.id
            ${whereStr}
            ${orderClause}
            LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
        `;
        
        const queryParams = [...params, limit, offset];
        const selectResult = await pool.query(selectQuery, queryParams);

        return res.json({
            leads: selectResult.rows,
            pagination: {
                page,
                limit,
                totalRows,
                totalPages
            }
        });

    } catch (err) {
        console.error('Error fetching leads:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Get single lead with full brand/influencer/agency detail and chronological activity timeline
async function getLeadById(req, res) {
    const { id } = req.params;

    try {
        const leadQuery = `
            SELECT l.*, 
                   COALESCE(b.display_name, b.username, '') as brand_name, 
                   b.snippet as brand_category, 
                   b.instagram_url as brand_url,
                   COALESCE(i.display_name, i.username, '') as influencer_name, i.followers as influencer_followers, i.instagram_url as influencer_url,
                   a.company_name as agency_name, a.website as agency_website, a.phone as agency_phone, a.email as agency_email, a.status as agency_status, a.address as agency_address,
                   u.username as assigned_username
            FROM leads l
            LEFT JOIN brands b ON l.brand_id = b.id
            LEFT JOIN influencers i ON l.influencer_id = i.id
            LEFT JOIN agencies a ON l.agency_id = a.id
            LEFT JOIN users u ON l.assigned_to = u.id
            WHERE l.id = $1 AND l.is_archived = false
        `;
        const leadRes = await pool.query(leadQuery, [id]);
        if (leadRes.rowCount === 0) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        const lead = leadRes.rows[0];

        // Fetch chronological activities (timeline)
        const timelineRes = await pool.query(
            'SELECT * FROM lead_activities WHERE lead_id = $1 ORDER BY timestamp DESC',
            [id]
        );

        // Fetch users list for assigning dropdown
        let users = [];
        if (req.session.user.role === 'ADMIN') {
            const usersRes = await pool.query('SELECT id, username, role FROM users ORDER BY username ASC');
            users = usersRes.rows;
        }

        return res.json({
            lead,
            timeline: timelineRes.rows,
            users
        });

    } catch (err) {
        console.error('Error fetching lead detail:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Create new lead from Brand, Influencer, or Agency
async function createLead(req, res) {
    const { brand_id, influencer_id, agency_id, notes } = req.body;
    const username = req.session.user.username;

    if (!brand_id && !influencer_id && !agency_id) {
        return res.status(400).json({ error: 'Brand ID, Influencer ID, or Agency ID is required' });
    }

    try {
        // Check if lead already exists
        let checkRes;
        if (brand_id) {
            checkRes = await pool.query("SELECT l.*, COALESCE(b.display_name, b.username, '') as record_name FROM leads l JOIN brands b ON l.brand_id = b.id WHERE l.brand_id = $1 AND l.is_archived = false", [brand_id]);
        } else if (influencer_id) {
            checkRes = await pool.query("SELECT l.*, COALESCE(i.display_name, i.username, '') as record_name FROM leads l JOIN influencers i ON l.influencer_id = i.id WHERE l.influencer_id = $1 AND l.is_archived = false", [influencer_id]);
        } else if (agency_id) {
            checkRes = await pool.query("SELECT l.*, COALESCE(a.company_name, a.website, '') as record_name FROM leads l JOIN agencies a ON l.agency_id = a.id WHERE l.agency_id = $1 AND l.is_archived = false", [agency_id]);
        }

        if (checkRes.rowCount > 0) {
            return res.status(409).json({ error: 'A lead already exists for this entity', lead: checkRes.rows[0] });
        }

        // Get name and type for audit logging
        let recordName = '';
        let recordType = 'Brand';
        let recordId = brand_id;
        if (brand_id) {
            const nameRes = await pool.query("SELECT COALESCE(display_name, username, '') as brand_name FROM brands WHERE id = $1", [brand_id]);
            if (nameRes.rowCount > 0) recordName = nameRes.rows[0].brand_name;
            recordType = 'Brand';
            recordId = brand_id;
        } else if (influencer_id) {
            const nameRes = await pool.query("SELECT COALESCE(display_name, username, '') as influencer_name FROM influencers WHERE id = $1", [influencer_id]);
            if (nameRes.rowCount > 0) recordName = nameRes.rows[0].influencer_name;
            recordType = 'Influencer';
            recordId = influencer_id;
        } else if (agency_id) {
            const nameRes = await pool.query("SELECT COALESCE(company_name, website, 'Agency') as agency_name FROM agencies WHERE id = $1", [agency_id]);
            if (nameRes.rowCount > 0) recordName = nameRes.rows[0].agency_name;
            recordType = 'Agency';
            recordId = agency_id;
        }

        const insertQuery = `
            INSERT INTO leads (brand_id, influencer_id, agency_id, status, notes)
            VALUES ($1, $2, $3, 'New', $4)
            RETURNING *
        `;
        const insertRes = await pool.query(insertQuery, [brand_id || null, influencer_id || null, agency_id || null, notes || '']);
        const newLead = insertRes.rows[0];

        // Global Audit Trail Log
        await logActivity(username, 'Lead created', recordType, recordId, recordName);

        // Timeline Entry
        await pool.query(
            `INSERT INTO lead_activities (lead_id, username, activity_type, details, notes) 
             VALUES ($1, $2, 'Note', 'Lead initialized in the system', $3)`,
            [newLead.id, username, notes || '']
        );

        return res.status(201).json(newLead);

    } catch (err) {
        console.error('Error creating lead:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Assign/Reassign lead to employee (Admin only)
async function assignLead(req, res) {
    const { id } = req.params;
    const { assigned_to } = req.body; // user ID
    const currentUsername = req.session.user.username;

    try {
        const leadRes = await pool.query(`
            SELECT l.*, 
                   COALESCE(b.display_name, b.username, '') as brand_name, 
                   COALESCE(i.display_name, i.username, '') as influencer_name,
                   COALESCE(a.company_name, a.website, '') as agency_name
            FROM leads l 
            LEFT JOIN brands b ON l.brand_id = b.id 
            LEFT JOIN influencers i ON l.influencer_id = i.id 
            LEFT JOIN agencies a ON l.agency_id = a.id
            WHERE l.id = $1 AND l.is_archived = false
        `, [id]);

        if (leadRes.rowCount === 0) {
            return res.status(404).json({ error: 'Lead not found' });
        }
        const lead = leadRes.rows[0];
        const recordName = lead.brand_name || lead.influencer_name || lead.agency_name;
        const recordType = lead.agency_id ? 'Agency' : (lead.brand_id ? 'Brand' : 'Influencer');
        const recordId = lead.agency_id || lead.brand_id || lead.influencer_id;

        // Get old assignee name
        let oldAssigneeName = 'Unassigned';
        if (lead.assigned_to) {
            const userRes = await pool.query('SELECT username FROM users WHERE id = $1', [lead.assigned_to]);
            if (userRes.rowCount > 0) oldAssigneeName = userRes.rows[0].username;
        }

        // Get new assignee name
        let newAssigneeName = 'Unassigned';
        if (assigned_to) {
            const userRes = await pool.query('SELECT username FROM users WHERE id = $1', [assigned_to]);
            if (userRes.rowCount > 0) newAssigneeName = userRes.rows[0].username;
        }

        if (oldAssigneeName === newAssigneeName) {
            return res.json({ success: true, message: 'Assignee did not change' });
        }

        await pool.query('UPDATE leads SET assigned_to = $1, updated_at = NOW() WHERE id = $2', [assigned_to || null, id]);

        // Global Audit Trail Log
        const actionText = lead.assigned_to ? 'Lead reassigned' : 'Lead assigned';
        await logActivity(currentUsername, actionText, recordType, recordId, recordName, 'assigned_to', oldAssigneeName, newAssigneeName);

        // Timeline Entry
        const detailsText = `Assigned to ${newAssigneeName} (previously: ${oldAssigneeName})`;
        await pool.query(
            `INSERT INTO lead_activities (lead_id, username, activity_type, details) 
             VALUES ($1, $2, 'Assignment', $3)`,
            [id, currentUsername, detailsText]
        );

        return res.json({ success: true, message: `Lead successfully assigned to ${newAssigneeName}` });

    } catch (err) {
        console.error('Error assigning lead:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Update lead status/temperature
async function updateLeadStatus(req, res) {
    const { id } = req.params;
    const { status, temperature } = req.body;
    const currentUsername = req.session.user.username;

    try {
        const leadRes = await pool.query(`
            SELECT l.*, 
                   COALESCE(b.display_name, b.username, '') as brand_name, 
                   COALESCE(i.display_name, i.username, '') as influencer_name,
                   COALESCE(a.company_name, a.website, '') as agency_name
            FROM leads l 
            LEFT JOIN brands b ON l.brand_id = b.id 
            LEFT JOIN influencers i ON l.influencer_id = i.id 
            LEFT JOIN agencies a ON l.agency_id = a.id
            WHERE l.id = $1 AND l.is_archived = false
        `, [id]);

        if (leadRes.rowCount === 0) {
            return res.status(404).json({ error: 'Lead not found' });
        }
        const lead = leadRes.rows[0];
        
        const updates = [];
        const params = [];
        let paramIdx = 1;
        let detailsTextParts = [];
        
        if (status && status !== lead.status) {
            updates.push(`status = $${paramIdx++}`);
            params.push(status);
            detailsTextParts.push(`Status updated to ${status} (previously: ${lead.status})`);
        }
        
        if (temperature && temperature !== lead.temperature) {
            updates.push(`temperature = $${paramIdx++}`);
            params.push(temperature);
            detailsTextParts.push(`Temperature updated to ${temperature} (previously: ${lead.temperature})`);
        }
        
        if (updates.length === 0) {
            return res.json({ success: true, message: 'No changes detected' });
        }
        
        updates.push(`updated_at = NOW()`);
        params.push(id);
        
        await pool.query(`UPDATE leads SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);

        // Audit & Timeline Logging
        const recordName = lead.brand_name || lead.influencer_name || lead.agency_name;
        const recordType = lead.agency_id ? 'Agency' : (lead.brand_id ? 'Brand' : 'Influencer');
        const recordId = lead.agency_id || lead.brand_id || lead.influencer_id;
        
        for (const part of detailsTextParts) {
            await pool.query(
                `INSERT INTO lead_activities (lead_id, username, activity_type, details) 
                 VALUES ($1, $2, 'Status Change', $3)`,
                [id, currentUsername, part]
            );
            
            if (part.includes('Status')) {
                await logActivity(currentUsername, 'Status changed', recordType, recordId, recordName, 'status', lead.status, status);
            } else if (part.includes('Temperature')) {
                await logActivity(currentUsername, 'Temperature changed', recordType, recordId, recordName, 'temperature', lead.temperature, temperature);
            }
        }

        return res.json({ success: true, message: 'Lead updated' });

    } catch (err) {
        console.error('Error updating lead status:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Bulk update leads (status, temperature, assignment, archive)
async function bulkUpdateLeads(req, res) {
    const { leadIds, action, value } = req.body;
    const currentUsername = req.session.user.username;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ error: 'No leads selected' });
    }

    try {
        let fieldToUpdate = '';
        let logAction = '';
        let activityType = '';
        let valueStr = value;

        if (action === 'status') {
            fieldToUpdate = 'status';
            logAction = 'Bulk Status change';
            activityType = 'Status Change';
        } else if (action === 'temperature') {
            fieldToUpdate = 'temperature';
            logAction = 'Bulk Temperature change';
            activityType = 'Status Change';
        } else if (action === 'assign') {
            fieldToUpdate = 'assigned_to';
            logAction = 'Bulk Assignment';
            activityType = 'Assignment';
            if (value === '') valueStr = null;
        } else if (action === 'archive') {
            fieldToUpdate = 'is_archived';
            logAction = 'Bulk Archive';
            activityType = 'Status Change';
            valueStr = true;
        } else {
            return res.status(400).json({ error: 'Invalid action' });
        }

        // Get leads info for logging
        const idsList = leadIds.join(',');
        const leadsRes = await pool.query(`
            SELECT l.id, l.${fieldToUpdate} as old_val, 
                   COALESCE(b.display_name, b.username, '') as brand_name, 
                   COALESCE(i.display_name, i.username, '') as influencer_name,
                   COALESCE(a.company_name, a.website, '') as agency_name,
                   l.brand_id, l.influencer_id, l.agency_id
            FROM leads l
            LEFT JOIN brands b ON l.brand_id = b.id
            LEFT JOIN influencers i ON l.influencer_id = i.id
            LEFT JOIN agencies a ON l.agency_id = a.id
            WHERE l.id = ANY($1::int[])
        `, [leadIds]);

        // Execute bulk update
        await pool.query(
            `UPDATE leads SET ${fieldToUpdate} = $1, updated_at = NOW() WHERE id = ANY($2::int[])`,
            [valueStr, leadIds]
        );

        // Get nice label for assignment
        let displayValue = valueStr;
        if (action === 'assign' && valueStr) {
            const uRes = await pool.query('SELECT username FROM users WHERE id = $1', [valueStr]);
            if (uRes.rowCount > 0) displayValue = uRes.rows[0].username;
        } else if (action === 'assign' && !valueStr) {
            displayValue = 'Unassigned';
        }

        // Create log entries
        for (const lead of leadsRes.rows) {
            if (lead.old_val == valueStr && action !== 'archive') continue; // skip if unchanged

            const recordName = lead.brand_name || lead.influencer_name || lead.agency_name;
            const recordType = lead.agency_id ? 'Agency' : (lead.brand_id ? 'Brand' : 'Influencer');
            const recordId = lead.agency_id || lead.brand_id || lead.influencer_id;
            
            // Format old value display for assign
            let oldDisplay = lead.old_val;
            if (action === 'assign') {
                if (lead.old_val) {
                    const oldURes = await pool.query('SELECT username FROM users WHERE id = $1', [lead.old_val]);
                    if (oldURes.rowCount > 0) oldDisplay = oldURes.rows[0].username;
                } else {
                    oldDisplay = 'Unassigned';
                }
            }

            await logActivity(currentUsername, logAction, recordType, recordId, recordName, fieldToUpdate, String(oldDisplay), String(displayValue));
            
            const detailText = `${logAction} to ${displayValue} (prev: ${oldDisplay})`;
            await pool.query(
                `INSERT INTO lead_activities (lead_id, username, activity_type, details) VALUES ($1, $2, $3, $4)`,
                [lead.id, currentUsername, activityType, detailText]
            );
        }

        res.json({ success: true, message: `Successfully updated ${leadsRes.rowCount} leads` });

    } catch (err) {
        console.error('Bulk update error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Log manual outreach activity (outreach, call, whatsapp, email, instagram, note, follow-up)
async function addLeadActivity(req, res) {
    const { id } = req.params;
    const { activity_type, details, notes, next_follow_up_date } = req.body;
    const currentUsername = req.session.user.username;

    const validTypes = ['Outreach', 'Call', 'WhatsApp', 'Email', 'Instagram', 'Note', 'Follow-up'];
    if (!validTypes.includes(activity_type)) {
        return res.status(400).json({ error: 'Invalid activity type' });
    }

    try {
        const leadRes = await pool.query(`
            SELECT l.*, 
                   COALESCE(b.display_name, b.username, '') as brand_name, 
                   COALESCE(i.display_name, i.username, '') as influencer_name,
                   COALESCE(a.company_name, a.website, '') as agency_name
            FROM leads l 
            LEFT JOIN brands b ON l.brand_id = b.id 
            LEFT JOIN influencers i ON l.influencer_id = i.id 
            LEFT JOIN agencies a ON l.agency_id = a.id
            WHERE l.id = $1 AND l.is_archived = false
        `, [id]);

        if (leadRes.rowCount === 0) {
            return res.status(404).json({ error: 'Lead not found' });
        }
        const lead = leadRes.rows[0];
        const recordName = lead.brand_name || lead.influencer_name || lead.agency_name;
        const recordType = lead.agency_id ? 'Agency' : (lead.brand_id ? 'Brand' : 'Influencer');
        const recordId = lead.agency_id || lead.brand_id || lead.influencer_id;

        // Insert timeline activity
        await pool.query(
            `INSERT INTO lead_activities (lead_id, username, activity_type, details, notes) 
             VALUES ($1, $2, $3, $4, $5)`,
            [id, currentUsername, activity_type, details || '', notes || '']
        );

        // Update Lead updated_at
        let updateQuery = 'UPDATE leads SET updated_at = NOW()';
        let updateParams = [id];

        // If next_follow_up_date is supplied or this is a 'Follow-up' event
        if (next_follow_up_date !== undefined) {
            updateQuery += ', next_follow_up_date = $2';
            updateParams.push(next_follow_up_date === '' ? null : next_follow_up_date);
        }
        updateQuery += ' WHERE id = $1';
        await pool.query(updateQuery, updateParams);

        // Global Audit Trail Log
        let auditAction = 'Outreach recorded';
        if (activity_type === 'Note') auditAction = 'Note added';
        else if (activity_type === 'Follow-up') auditAction = 'Follow-up created/completed';
        
        await logActivity(currentUsername, auditAction, recordType, recordId, recordName, null, null, `${activity_type}: ${details}`);

        return res.status(201).json({ success: true, message: 'Activity recorded successfully' });

    } catch (err) {
        console.error('Error adding lead activity:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Get global activities for admins
async function getEmployeeActivities(req, res) {
    if (req.session.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden: Admin only' });
    }

    let { page = 1, limit = 50 } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    try {
        const countRes = await pool.query('SELECT COUNT(*) FROM lead_activities');
        const totalRows = parseInt(countRes.rows[0].count);
        const totalPages = Math.ceil(totalRows / limit);

        const activitiesQuery = `
            SELECT la.*,
                   COALESCE(b.display_name, b.username, '') as brand_name, 
                   COALESCE(i.display_name, i.username, '') as influencer_name,
                   COALESCE(a.company_name, a.website, '') as agency_name
            FROM lead_activities la
            JOIN leads l ON la.lead_id = l.id
            LEFT JOIN brands b ON l.brand_id = b.id
            LEFT JOIN influencers i ON l.influencer_id = i.id
            LEFT JOIN agencies a ON l.agency_id = a.id
            ORDER BY la.timestamp DESC
            LIMIT $1 OFFSET $2
        `;
        const activitiesRes = await pool.query(activitiesQuery, [limit, offset]);

        return res.json({
            activities: activitiesRes.rows,
            pagination: {
                page,
                limit,
                totalRows,
                totalPages
            }
        });
    } catch (err) {
        console.error('Error fetching global employee activities:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    getLeads,
    getLeadById,
    createLead,
    assignLead,
    updateLeadStatus,
    bulkUpdateLeads,
    addLeadActivity,
    getEmployeeActivities
};
