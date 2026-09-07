// server/routes/imports.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const importController = require('../controllers/importController');
const { requireLogin } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/preview', requireLogin, upload.single('file'), importController.getPreview);
router.post('/commit', requireLogin, importController.commitImport);

module.exports = router;
