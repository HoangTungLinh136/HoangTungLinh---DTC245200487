const db = require('../config/db');

/**
 * Log an action to audit_logs
 * @param {number|null} userId 
 * @param {string} action 
 * @param {string} targetType 
 * @param {number|null} targetId 
 * @param {object|null} details 
 * @param {string|null} ipAddress 
 */
async function logAudit(userId, action, targetType, targetId = null, details = null, ipAddress = null) {
  try {
    const detailsJson = details ? JSON.stringify(details) : null;
    await db.execute(
      `INSERT INTO audit_logs (user_id, action, target_type, target_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId || null, action, targetType, targetId || null, detailsJson, ipAddress || null]
    );
  } catch (error) {
    console.error('[AuditService] Failed to record audit log:', error.message);
  }
}

module.exports = {
  logAudit
};
