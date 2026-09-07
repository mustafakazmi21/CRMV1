// server/middleware/auth.js

function requireLogin(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized: Please log in' });
}

function requireRole(allowedRoles) {
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ error: 'Unauthorized: Please log in' });
        }
        if (allowedRoles.includes(req.session.user.role)) {
            return next();
        }
        return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    };
}

module.exports = {
    requireLogin,
    requireRole
};
