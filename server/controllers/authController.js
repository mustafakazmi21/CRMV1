// server/controllers/authController.js
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const { logActivity } = require('../services/activityLogService');

async function login(req, res) {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username.toLowerCase().trim()]);
        if (result.rowCount === 0) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Store in session
        req.session.user = {
            id: user.id,
            username: user.username,
            role: user.role
        };

        // Log action
        await logActivity(user.username, 'Employee login', 'User', user.id, user.username);

        return res.json({
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Internal server error: ' + err.message + ' | URL: ' + (process.env.DATABASE_URL ? 'set' : 'not set') });
    }
}

async function logout(req, res) {
    if (!req.session || !req.session.user) {
        return res.json({ success: true });
    }

    const { username, id } = req.session.user;
    try {
        // Log action before session is cleared
        await logActivity(username, 'Employee logout', 'User', id, username);
        
        req.session.destroy((err) => {
            if (err) {
                console.error('Logout session destroy error:', err);
                return res.status(500).json({ error: 'Failed to log out' });
            }
            res.clearCookie('connect.sid');
            return res.json({ success: true });
        });
    } catch (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

async function getMe(req, res) {
    if (req.session && req.session.user) {
        return res.json({ user: req.session.user });
    }
    return res.json({ user: null });
}

module.exports = {
    login,
    logout,
    getMe
};
