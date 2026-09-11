// server/routes/outreach.js
const express = require('express');
const router = express.Router();
const outreachController = require('../controllers/outreachController');
const { requireLogin } = require('../middleware/auth');

router.get('/', requireLogin, outreachController.getOutreachRecords);
router.get('/stats', requireLogin, outreachController.getOutreachStats);

module.exports = router;
