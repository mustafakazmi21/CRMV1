// server/routes/users.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { requireLogin, requireRole } = require('../middleware/auth');

router.get('/', requireLogin, requireRole(['ADMIN']), userController.getUsers);
router.post('/', requireLogin, requireRole(['ADMIN']), userController.addUser);
router.post('/:id/reset-password', requireLogin, requireRole(['ADMIN']), userController.resetPassword);

module.exports = router;
