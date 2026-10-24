const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

// Admin routes require authentication and admin role
router.use(authenticate, requireRole(['admin']));

router.get('/users', adminController.listUsers);
router.patch('/users/:id', adminController.updateUser);
router.get('/stats', adminController.getSystemStats);
router.get('/audit-logs', adminController.getAuditLogs);

module.exports = router;
