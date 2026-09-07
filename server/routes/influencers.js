// server/routes/influencers.js
const express = require('express');
const router = express.Router();
const influencerController = require('../controllers/influencerController');
const { requireLogin } = require('../middleware/auth');

router.get('/', requireLogin, influencerController.getInfluencers);
router.get('/:id', requireLogin, influencerController.getInfluencerById);
router.post('/', requireLogin, influencerController.createInfluencer);
router.put('/:id', requireLogin, influencerController.updateInfluencer);
router.post('/:id/archive', requireLogin, influencerController.archiveInfluencer);
router.post('/:id/unarchive', requireLogin, influencerController.unarchiveInfluencer);

module.exports = router;
