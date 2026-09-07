// server/routes/leads.js
const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const { requireLogin, requireRole } = require('../middleware/auth');

router.get('/', requireLogin, leadController.getLeads);
router.get('/activities', requireLogin, requireRole(['ADMIN']), leadController.getEmployeeActivities);
router.get('/:id', requireLogin, leadController.getLeadById);
router.post('/', requireLogin, leadController.createLead);
router.post('/bulk', requireLogin, requireRole(['ADMIN']), leadController.bulkUpdateLeads);
router.put('/:id/assign', requireLogin, requireRole(['ADMIN']), leadController.assignLead);
router.put('/:id/status', requireLogin, leadController.updateLeadStatus);
router.post('/:id/activity', requireLogin, leadController.addLeadActivity);

module.exports = router;
