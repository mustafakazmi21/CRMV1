const express = require('express');
const router = express.Router();
const agencyController = require('../controllers/agencyController');
const { requireLogin } = require('../middleware/auth');

router.get('/', requireLogin, agencyController.getAgencies);
router.post('/', requireLogin, agencyController.addAgency);
router.put('/:id', requireLogin, agencyController.updateAgency);

module.exports = router;
