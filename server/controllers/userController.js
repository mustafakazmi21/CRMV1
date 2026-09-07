// server/controllers/userController.js
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const { logActivity } = require('../services/activityLogService');

async function getUsers(req, res) {
    try {
        const result = await pool.query(
            'SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC'
        );
        return res.json({ users: result.rows });
    } catch (err) {
        console.error('Error fetching users:', err);
        return res.status(500).json({ error: 'Failed to fetch users' });
    }
}

async function addUser(req, res) {
    const { username, email, password, role } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ error: 'Username, password, and role are required' });
    }

    if (!['ADMIN', 'EMPLOYEE'].includes(role)) {
        return res.status(400).json({ error: 'Role must be ADMIN or EMPLOYEE' });
    }

    const cleanUsername = username.toLowerCase().trim();
    const cleanEmail = email ? email.toLowerCase().trim() : null;

    try {
        // Check if username already exists
        const existing = await pool.query('SELECT id FROM users WHERE username = $1', [cleanUsername]);
        if (existing.rowCount > 0) {
            return res.status(409).json({ error: 'Username already exists' });
        }

        // Check if email already exists (if provided)
        if (cleanEmail) {
            const existingEmail = await pool.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
            if (existingEmail.rowCount > 0) {
                return res.status(409).json({ error: 'Email already in use' });
            }
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const result = await pool.query(
            'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role, created_at',
            [cleanUsername, cleanEmail, hashedPassword, role]
        );

        const newUser = result.rows[0];

        // Log activity
        const adminUsername = req.session.user.username;
        await logActivity(adminUsername, 'User added', 'User', newUser.id, newUser.username);

        return res.status(201).json({ user: newUser });
    } catch (err) {
        console.error('Error adding user:', err);
        return res.status(500).json({ error: 'Failed to add user' });
    }
}

async function resetPassword(req, res) {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        const userCheck = await pool.query('SELECT username FROM users WHERE id = $1', [id]);
        if (userCheck.rowCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const username = userCheck.rows[0].username;

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, id]);

        const adminUsername = req.session.user.username;
        await logActivity(adminUsername, 'Password reset', 'User', id, username);

        return res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
        console.error('Error resetting password:', err);
        return res.status(500).json({ error: 'Failed to reset password' });
    }
}

module.exports = {
    getUsers,
    addUser,
    resetPassword
};
