// server/routes/instagram.js
const express = require('express');
const router = express.Router();
const instagramController = require('../controllers/instagramController');
const { requireLogin, requireRole } = require('../middleware/auth');

// Webhook endpoints (no login required for Meta to access)
router.get('/webhook', instagramController.verifyWebhook);
router.post('/webhook', instagramController.handleWebhook);

// Internal CRM API endpoints
router.get('/follow-ups', requireLogin, instagramController.getFollowUps);
router.put('/follow-ups/:id/status', requireLogin, instagramController.updateFollowUp);

// Admin dashboard stats
router.get('/stats', requireLogin, requireRole(['ADMIN']), instagramController.getStats);

module.exports = router;
