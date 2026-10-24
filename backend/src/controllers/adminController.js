const adminRepo = require('../repositories/adminRepository');
const sessionRepo = require('../repositories/sessionRepository');
const auditRepo = require('../repositories/auditRepository');

/**
 * List all users with account metadata
 */
async function listUsers(req, res) {
  try {
    const { role, status, search } = req.query;
    const users = await adminRepo.listUsers({ role, status, search });
    return res.json({ users });
  } catch (error) {
    console.error('[AdminController.listUsers] Error:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve users' });
  }
}

/**
 * Update user status (lock / unlock) or role - BD-02
 */
async function updateUser(req, res) {
  try {
    const adminId = req.user.id;
    const targetUserId = parseInt(req.params.id, 10);
    const { status, role } = req.body;

    // Prevent admin from locking self
    if (targetUserId === adminId && status === 'locked') {
      return res.status(400).json({ error: 'Cannot lock your own administrator account' });
    }

    if (status && !['active', 'locked'].includes(status)) {
      return res.status(400).json({ error: 'status must be "active" or "locked"' });
    }

    if (role && !['admin', 'teacher', 'student'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (!status && !role) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const updated = await adminRepo.updateUserAccount(targetUserId, { status, role });
    if (!updated) {
      return res.status(404).json({ error: 'User not found or unchanged' });
    }

    // If user is locked, invalidate all active sessions
    if (status === 'locked') {
      await sessionRepo.deleteByUserId(targetUserId);
    }

    await auditRepo.log(adminId, 'UPDATE_USER_ACCOUNT', 'USER', targetUserId, { status, role }, req.ip);

    return res.json({ message: 'User account updated successfully' });
  } catch (error) {
    console.error('[AdminController.updateUser] Error:', error.message);
    return res.status(500).json({ error: 'Failed to update user' });
  }
}

/**
 * System metadata and aggregates (TC-01 Option B: Safe Aggregates Only)
 * Admin cannot view academic contents (questions, answers, student grades)
 */
async function getSystemStats(req, res) {
  try {
    const stats = await adminRepo.getOperationalStats();
    return res.json({ stats });
  } catch (error) {
    console.error('[AdminController.getSystemStats] Error:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve system statistics' });
  }
}

/**
 * Query immutable audit logs
 */
async function getAuditLogs(req, res) {
  try {
    const { action, userId, limit = 50, offset = 0 } = req.query;
    const parsedLimit = Math.min(parseInt(limit, 10) || 50, 100);
    const parsedOffset = parseInt(offset, 10) || 0;

    const logs = await auditRepo.list({ action, userId }, parsedLimit, parsedOffset);
    const total = await auditRepo.count({ action, userId });

    return res.json({
      logs,
      pagination: {
        total,
        limit: parsedLimit,
        offset: parsedOffset
      }
    });
  } catch (error) {
    console.error('[AdminController.getAuditLogs] Error:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
}

module.exports = {
  listUsers,
  updateUser,
  getSystemStats,
  getAuditLogs
};
