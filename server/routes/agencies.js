const express = require('express');
const router = express.Router();
const agencyController = require('../controllers/agencyController');
const { requireLogin } = require('../middleware/auth');

router.get('/', requireLogin, agencyController.getAgencies);
router.get('/:id', requireLogin, agencyController.getAgencyById);
router.post('/', requireLogin, agencyController.createAgency);
router.put('/:id', requireLogin, agencyController.updateAgency);
router.post('/:id/archive', requireLogin, agencyController.archiveAgency);
router.post('/:id/unarchive', requireLogin, agencyController.unarchiveAgency);

module.exports = router;

