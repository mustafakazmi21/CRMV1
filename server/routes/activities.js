// server/routes/activities.js
const express = require('express');
const router = express.Router();
const activityController = require('../controllers/activityController');
const { requireLogin, requireRole } = require('../middleware/auth');

router.get('/', requireLogin, requireRole(['ADMIN']), activityController.getActivityLogs);
router.get('/dashboard', requireLogin, activityController.getDashboardStats);

module.exports = router;
