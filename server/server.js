// server/server.js
const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const brandRoutes = require('./routes/brands');
const influencerRoutes = require('./routes/influencers');
const activityRoutes = require('./routes/activities');
const leadRoutes = require('./routes/leads');
const importRoutes = require('./routes/imports');
const userRoutes = require('./routes/users');
const agencyRoutes = require('./routes/agencies');
const instagramRoutes = require('./routes/instagram');

const app = express();
const PORT = process.env.PORT || 3002;

// Parse incoming request body
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const pgSession = require('connect-pg-simple')(session);
const pool = require('./config/db');

// Trust proxy for Render / production HTTPS
app.set('trust proxy', 1);

// Configure session middleware with PostgreSQL persistence
app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'session',
        createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET || 'crm_super_secret_session_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Serve static assets from public/
app.use(express.static(path.join(__dirname, '../public')));

// Routes mapping
app.use('/api/auth', authRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/influencers', influencerRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/import', importRoutes);
app.use('/api/users', userRoutes);
app.use('/api/agencies', agencyRoutes);
app.use('/api/instagram', instagramRoutes);

// Catch-all route to serve the SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(` CRM V1 server is running on http://localhost:${PORT}`);
    console.log(`==================================================`);
});
