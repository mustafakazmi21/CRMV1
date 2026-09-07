// server/controllers/instagramController.js
const pool = require('../config/db');
const { logActivity } = require('../services/activityLogService');

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'crm_verify_token_123';

// GET /api/instagram/webhook - Meta verification
async function verifyWebhook(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            return res.status(200).send(challenge);
        } else {
            return res.sendStatus(403);
        }
    }
    return res.sendStatus(400);
}

// POST /api/instagram/webhook - Handle incoming messages
async function handleWebhook(req, res) {
    const body = req.body;

    if (body.object === 'instagram') {
        if (body.entry) {
            for (const entry of body.entry) {
                if (entry.messaging) {
                    for (const event of entry.messaging) {
                        if (event.message && !event.message.is_echo) {
                            await processIncomingMessage(event);
                        }
                    }
                }
            }
        }
        return res.status(200).send('EVENT_RECEIVED');
    } else {
        return res.sendStatus(404);
    }
}

async function processIncomingMessage(event) {
    const senderId = event.sender.id; // Instagram-scoped ID
    const text = event.message.text || 'Sent an attachment/media';
    const timestamp = new Date(event.timestamp || Date.now());

    // In a real integration, you would use the Meta Graph API to resolve senderId to a username.
    // For this simulation/architecture, we'll assume the payload includes the username or we mock it.
    // Real API requires: GET /<IG_SID>?fields=username
    const senderUsername = event.sender.username || `user_${senderId}`; 

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Attempt to find existing lead by matching instagram handle
        let leadId = null;
        let assignedTo = null;
        let leadName = 'Unknown Profile';

        // Clean handle for matching
        const searchHandle = senderUsername.toLowerCase().replace(/^@/, '');

        // 1. Check Brands
        const brandRes = await client.query(`
            SELECT l.id as lead_id, l.assigned_to, b.brand_name as name 
            FROM leads l 
            JOIN brands b ON l.brand_id = b.id 
            WHERE lower(b.instagram) LIKE $1 OR lower(b.company_url) LIKE $1
            LIMIT 1
        `, [`%${searchHandle}%`]);

        if (brandRes.rows.length > 0) {
            leadId = brandRes.rows[0].lead_id;
            assignedTo = brandRes.rows[0].assigned_to;
            leadName = brandRes.rows[0].name;
        } else {
            // 2. Check Influencers
            const infRes = await client.query(`
                SELECT l.id as lead_id, l.assigned_to, i.influencer_name as name 
                FROM leads l 
                JOIN influencers i ON l.influencer_id = i.id 
                WHERE lower(i.instagram_url) LIKE $1
                LIMIT 1
            `, [`%${searchHandle}%`]);
            
            if (infRes.rows.length > 0) {
                leadId = infRes.rows[0].lead_id;
                assignedTo = infRes.rows[0].assigned_to;
                leadName = infRes.rows[0].name;
            }
        }

        // Insert follow-up record
        const insertQ = `
            INSERT INTO instagram_follow_ups 
            (lead_id, assigned_to, instagram_username, message_snippet, status, received_at)
            VALUES ($1, $2, $3, $4, 'Unread', $5)
            RETURNING id
        `;
        const newRecord = await client.query(insertQ, [
            leadId, 
            assignedTo, 
            senderUsername, 
            text.substring(0, 255), // truncate snippet
            timestamp
        ]);

        const followUpId = newRecord.rows[0].id;

        // Log to lead activities if matched
        if (leadId) {
            const actQ = `
                INSERT INTO lead_activities (lead_id, username, activity_type, details, timestamp)
                VALUES ($1, 'System', 'Instagram', $2, $3)
            `;
            await client.query(actQ, [
                leadId,
                `Instagram reply detected from @${senderUsername}`,
                timestamp
            ]);
        }

        // Log global activity
        await logActivity(
            'System', 
            'Instagram reply detected', 
            'Follow-up', 
            followUpId, 
            leadName,
            null, null, 
            `Received reply from @${senderUsername}`
        );

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error processing incoming message:', err);
    } finally {
        client.release();
    }
}

// GET /api/instagram/follow-ups
async function getFollowUps(req, res) {
    const user = req.session.user;
    
    let query = `
        SELECT i.*, 
               u.username as assigned_username,
               CASE 
                   WHEN l.brand_id IS NOT NULL THEN b.brand_name
                   WHEN l.influencer_id IS NOT NULL THEN inf.influencer_name
                   ELSE 'Unknown Profile'
               END as profile_name
        FROM instagram_follow_ups i
        LEFT JOIN leads l ON i.lead_id = l.id
        LEFT JOIN brands b ON l.brand_id = b.id
        LEFT JOIN influencers inf ON l.influencer_id = inf.id
        LEFT JOIN users u ON i.assigned_to = u.id
    `;

    const values = [];
    if (user.role !== 'ADMIN') {
        query += ` WHERE i.assigned_to = $1 OR i.assigned_to IS NULL `;
        values.push(user.id);
    }

    query += ` ORDER BY i.status = 'Unread' DESC, i.status = 'Needs Follow-up' DESC, i.received_at DESC `;

    try {
        const result = await pool.query(query, values);
        return res.json({ followUps: result.rows });
    } catch (err) {
        console.error('Error fetching follow-ups:', err);
        return res.status(500).json({ error: 'Database error fetching follow-ups' });
    }
}

// PUT /api/instagram/follow-ups/:id/status
async function updateFollowUp(req, res) {
    const { id } = req.params;
    const { status } = req.body;
    const username = req.session.user.username;

    if (!['Unread', 'Needs Follow-up', 'Handled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        const checkQ = 'SELECT * FROM instagram_follow_ups WHERE id = $1';
        const checkRes = await pool.query(checkQ, [id]);
        if (checkRes.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        
        const oldStatus = checkRes.rows[0].status;
        const leadId = checkRes.rows[0].lead_id;

        let handledAtUpdate = '';
        if (status === 'Handled') {
            handledAtUpdate = ', handled_at = NOW()';
        }

        const updateQ = `UPDATE instagram_follow_ups SET status = $1 ${handledAtUpdate} WHERE id = $2 RETURNING *`;
        const updated = await pool.query(updateQ, [status, id]);

        // Log global activity
        await logActivity(
            username,
            `Instagram follow-up marked ${status}`,
            'Follow-up',
            id,
            checkRes.rows[0].instagram_username
        );

        // Log in lead timeline if marked handled
        if (status === 'Handled' && leadId) {
            await pool.query(`
                INSERT INTO lead_activities (lead_id, username, activity_type, details)
                VALUES ($1, $2, 'Follow-up', 'Handled Instagram reply')
            `, [leadId, username]);
        }

        return res.json({ followUp: updated.rows[0] });
    } catch (err) {
        console.error('Error updating follow-up:', err);
        return res.status(500).json({ error: 'Database error updating follow-up' });
    }
}

// GET /api/instagram/stats (Admin Only)
async function getStats(req, res) {
    if (req.session.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });

    try {
        // Overall stats
        const overallRes = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE status = 'Unread') as unread,
                COUNT(*) FILTER (WHERE status = 'Needs Follow-up') as needs_followup,
                COUNT(*) FILTER (WHERE status != 'Handled' AND received_at < NOW() - INTERVAL '24 hours') as overdue
            FROM instagram_follow_ups
        `);

        // Breakdown by employee
        const empRes = await pool.query(`
            SELECT 
                COALESCE(u.username, 'Unassigned') as employee,
                COUNT(*) FILTER (WHERE i.status = 'Unread') as unread,
                COUNT(*) FILTER (WHERE i.status = 'Needs Follow-up') as needs_followup
            FROM instagram_follow_ups i
            LEFT JOIN users u ON i.assigned_to = u.id
            WHERE i.status != 'Handled'
            GROUP BY u.username
            ORDER BY unread DESC, needs_followup DESC
        `);

        return res.json({
            overall: overallRes.rows[0],
            employeeBreakdown: empRes.rows
        });
    } catch (err) {
        console.error('Error fetching instagram stats:', err);
        return res.status(500).json({ error: 'Database error' });
    }
}

module.exports = {
    verifyWebhook,
    handleWebhook,
    getFollowUps,
    updateFollowUp,
    getStats
};
