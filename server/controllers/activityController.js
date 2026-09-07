// server/controllers/activityController.js
const pool = require('../config/db');

// Get global activity logs (for admins only)
async function getActivityLogs(req, res) {
    let { page = 1, limit = 50 } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    try {
        const countRes = await pool.query('SELECT COUNT(*) FROM activity_logs');
        const totalRows = parseInt(countRes.rows[0].count);
        const totalPages = Math.ceil(totalRows / limit);

        const logsRes = await pool.query(
            'SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT $1 OFFSET $2',
            [limit, offset]
        );

        return res.json({
            logs: logsRes.rows,
            pagination: {
                page,
                limit,
                totalRows,
                totalPages
            }
        });
    } catch (err) {
        console.error('Error fetching activity logs:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Get aggregate stats for the dashboard
async function getDashboardStats(req, res) {
    try {
        const stats = {
            activeBrands: 0,
            archivedBrands: 0,
            activeInfluencers: 0,
            archivedInfluencers: 0,
            totalLogs: 0
        };

        const brandsRes = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE is_archived = false) as active_count,
                COUNT(*) FILTER (WHERE is_archived = true) as archived_count
            FROM brands
        `);
        stats.activeBrands = parseInt(brandsRes.rows[0].active_count);
        stats.archivedBrands = parseInt(brandsRes.rows[0].archived_count);

        const influencersRes = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE is_archived = false) as active_count,
                COUNT(*) FILTER (WHERE is_archived = true) as archived_count
            FROM influencers
        `);
        stats.activeInfluencers = parseInt(influencersRes.rows[0].active_count);
        stats.archivedInfluencers = parseInt(influencersRes.rows[0].archived_count);

        const logsRes = await pool.query('SELECT COUNT(*) FROM activity_logs');
        stats.totalLogs = parseInt(logsRes.rows[0].count);

        return res.json(stats);
    } catch (err) {
        console.error('Error fetching dashboard stats:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    getActivityLogs,
    getDashboardStats
};
