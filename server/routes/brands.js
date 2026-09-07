// server/routes/brands.js
const express = require('express');
const router = express.Router();
const brandController = require('../controllers/brandController');
const { requireLogin } = require('../middleware/auth');

router.get('/', requireLogin, brandController.getBrands);
router.get('/:id', requireLogin, brandController.getBrandById);
router.post('/', requireLogin, brandController.createBrand);
router.put('/:id', requireLogin, brandController.updateBrand);
router.post('/:id/archive', requireLogin, brandController.archiveBrand);
router.post('/:id/unarchive', requireLogin, brandController.unarchiveBrand);

module.exports = router;
