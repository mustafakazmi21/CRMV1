// server/controllers/outreachController.js
const pool = require('../config/db');

async function getOutreachRecords(req, res) {
    const { role, id: userId, username } = req.session.user;
    let {
        page = 1,
        limit = 50,
        type = 'all', // 'all', 'Brand', 'Influencer', 'Agency'
        employee = '', // user ID or username
        datePreset = '', // 'today', 'this_week', 'this_month', 'custom'
        dateFrom = '',
        dateTo = '',
        status = '',
        temperature = '',
        search = ''
    } = req.query;

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 50;
    const offset = (page - 1) * limit;

    try {
        let whereClauses = ['l.is_archived = false'];
        let params = [];
        let paramIdx = 1;

        // Role restriction for employees: can view leads assigned to them or where they logged activity
        if (role === 'EMPLOYEE') {
            whereClauses.push(`(l.assigned_to = $${paramIdx} OR EXISTS (SELECT 1 FROM lead_activities la_emp WHERE la_emp.lead_id = l.id AND la_emp.username = $${paramIdx + 1}))`);
            params.push(userId, username);
            paramIdx += 2;
        } else if (role === 'ADMIN' && employee) {
            // Admin filter by specific employee ID or username
            if (!isNaN(employee) && parseInt(employee) > 0) {
                const empId = parseInt(employee);
                whereClauses.push(`(l.assigned_to = $${paramIdx} OR EXISTS (SELECT 1 FROM lead_activities la_emp JOIN users u_emp ON la_emp.username = u_emp.username WHERE la_emp.lead_id = l.id AND u_emp.id = $${paramIdx}))`);
                params.push(empId);
                paramIdx++;
            } else {
                whereClauses.push(`(u.username = $${paramIdx} OR EXISTS (SELECT 1 FROM lead_activities la_emp WHERE la_emp.lead_id = l.id AND la_emp.username = $${paramIdx}))`);
                params.push(employee);
                paramIdx++;
            }
        }

        // Type filter
        if (type && type !== 'all') {
            if (type.toLowerCase() === 'brand') {
                whereClauses.push('l.brand_id IS NOT NULL');
            } else if (type.toLowerCase() === 'influencer') {
                whereClauses.push('l.influencer_id IS NOT NULL');
            } else if (type.toLowerCase() === 'agency') {
                whereClauses.push('l.agency_id IS NOT NULL');
            }
        }

        // Status filter
        if (status) {
            whereClauses.push(`l.status = $${paramIdx}`);
            params.push(status);
            paramIdx++;
        }

        // Temperature filter
        if (temperature) {
            whereClauses.push(`l.temperature = $${paramIdx}`);
            params.push(temperature);
            paramIdx++;
        }

        // Date Reached Out Filter (uses actual outreach timestamp from lead_activities or fallback to updated_at)
        const dateExpression = 'COALESCE(latest_act.timestamp, l.updated_at, l.created_at)';
        
        if (datePreset === 'today') {
            whereClauses.push(`${dateExpression} >= CURRENT_DATE AND ${dateExpression} < CURRENT_DATE + INTERVAL '1 day'`);
        } else if (datePreset === 'this_week') {
            whereClauses.push(`${dateExpression} >= DATE_TRUNC('week', CURRENT_DATE) AND ${dateExpression} < DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '1 week'`);
        } else if (datePreset === 'this_month') {
            whereClauses.push(`${dateExpression} >= DATE_TRUNC('month', CURRENT_DATE) AND ${dateExpression} < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'`);
        } else if (datePreset === 'custom' || (dateFrom || dateTo)) {
            if (dateFrom) {
                whereClauses.push(`${dateExpression} >= $${paramIdx}::timestamp`);
                params.push(`${dateFrom} 00:00:00`);
                paramIdx++;
            }
            if (dateTo) {
                whereClauses.push(`${dateExpression} <= $${paramIdx}::timestamp`);
                params.push(`${dateTo} 23:59:59.999`);
                paramIdx++;
            }
        }

        // Search filter (Name, username, website, instagram, location/snippet/address)
        if (search && search.trim() !== '') {
            const searchPattern = `%${search.trim()}%`;
            whereClauses.push(`(
                b.display_name ILIKE $${paramIdx} OR 
                b.username ILIKE $${paramIdx} OR 
                b.instagram_url ILIKE $${paramIdx} OR 
                b.snippet ILIKE $${paramIdx} OR
                i.display_name ILIKE $${paramIdx} OR 
                i.username ILIKE $${paramIdx} OR 
                i.instagram_url ILIKE $${paramIdx} OR 
                i.snippet ILIKE $${paramIdx} OR 
                i.category ILIKE $${paramIdx} OR
                a.company_name ILIKE $${paramIdx} OR 
                a.website ILIKE $${paramIdx} OR 
                a.address ILIKE $${paramIdx} OR
                a.instagram ILIKE $${paramIdx} OR
                latest_act.details ILIKE $${paramIdx} OR
                latest_act.notes ILIKE $${paramIdx}
            )`);
            params.push(searchPattern);
            paramIdx++;
        }

        const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

        // Base Query with Lateral joins for latest activity and activity count
        const baseQueryFrom = `
            FROM leads l
            LEFT JOIN brands b ON l.brand_id = b.id
            LEFT JOIN influencers i ON l.influencer_id = i.id
            LEFT JOIN agencies a ON l.agency_id = a.id
            LEFT JOIN users u ON l.assigned_to = u.id
            LEFT JOIN LATERAL (
                SELECT la.activity_type, la.details, la.notes, la.username, la.timestamp
                FROM lead_activities la
                WHERE la.lead_id = l.id
                ORDER BY la.timestamp DESC
                LIMIT 1
            ) latest_act ON true
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::int AS activity_count
                FROM lead_activities la
                WHERE la.lead_id = l.id
            ) act_counts ON true
        `;

        // Total Count Query
        const countQuery = `
            SELECT COUNT(*) 
            ${baseQueryFrom}
            ${whereStr}
        `;
        const countRes = await pool.query(countQuery, params);
        const totalRows = parseInt(countRes.rows[0].count);
        const totalPages = Math.ceil(totalRows / limit);

        // Select Data Query
        const selectQuery = `
            SELECT 
                l.id AS lead_id,
                l.status AS lead_status,
                l.temperature,
                l.notes AS lead_notes,
                l.next_follow_up_date,
                l.created_at AS lead_created_at,
                l.updated_at AS lead_updated_at,
                l.assigned_to,
                u.username AS assigned_username,
                -- Entity Type & ID
                CASE 
                    WHEN l.brand_id IS NOT NULL THEN 'Brand'
                    WHEN l.influencer_id IS NOT NULL THEN 'Influencer'
                    WHEN l.agency_id IS NOT NULL THEN 'Agency'
                    ELSE 'Unknown'
                END AS entity_type,
                COALESCE(l.brand_id, l.influencer_id, l.agency_id) AS entity_id,
                l.brand_id,
                l.influencer_id,
                l.agency_id,
                -- Unified Profile Info
                COALESCE(b.display_name, b.username, i.display_name, i.username, a.company_name, a.website, 'Unnamed') AS name,
                COALESCE(b.username, i.username, '') AS username,
                COALESCE(b.instagram_url, i.instagram_url, a.instagram, '') AS instagram_url,
                COALESCE(b.source_url, i.source_url, a.website, '') AS website,
                COALESCE(b.snippet, i.snippet, a.address, '') AS location_snippet,
                b.followers AS brand_followers,
                i.followers AS influencer_followers,
                i.category AS influencer_category,
                a.phone AS agency_phone,
                a.email AS agency_email,
                -- Latest Outreach Activity
                latest_act.activity_type AS last_activity_type,
                latest_act.details AS last_activity_details,
                latest_act.notes AS last_activity_notes,
                latest_act.username AS last_outreach_by,
                COALESCE(latest_act.timestamp, l.updated_at, l.created_at) AS last_outreach_date,
                COALESCE(act_counts.activity_count, 0) AS total_activities
            ${baseQueryFrom}
            ${whereStr}
            ORDER BY COALESCE(latest_act.timestamp, l.updated_at, l.created_at) DESC
            LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
        `;

        const queryParams = [...params, limit, offset];
        const selectRes = await pool.query(selectQuery, queryParams);

        return res.json({
            records: selectRes.rows,
            pagination: {
                page,
                limit,
                totalRows,
                totalPages
            }
        });

    } catch (err) {
        console.error('Error fetching outreach records:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Fetch Outreach Summary Statistics for quick header badges
async function getOutreachStats(req, res) {
    try {
        const statsQuery = `
            SELECT 
                COUNT(*) AS total_reached_out,
                COUNT(CASE WHEN l.brand_id IS NOT NULL THEN 1 END) AS brands_count,
                COUNT(CASE WHEN l.influencer_id IS NOT NULL THEN 1 END) AS influencers_count,
                COUNT(CASE WHEN l.agency_id IS NOT NULL THEN 1 END) AS agencies_count,
                COUNT(CASE WHEN l.status = 'Responded' THEN 1 END) AS responded_count,
                COUNT(CASE WHEN l.status IN ('Demo Scheduled', 'Demo Done') THEN 1 END) AS demos_count,
                COUNT(CASE WHEN l.status = 'Closed Won' THEN 1 END) AS won_count
            FROM leads l
            WHERE l.is_archived = false
        `;
        const result = await pool.query(statsQuery);
        return res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching outreach stats:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    getOutreachRecords,
    getOutreachStats
};
