const db = require('../config/db');

/**
 * Audit Repository - Data Access Layer for audit_logs
 */
class AuditRepository {
  async log(userId, action, targetType, targetId = null, details = null, ipAddress = null, connection = null) {
    const client = connection || db;
    const detailsJson = details ? JSON.stringify(details) : null;
    const [result] = await client.execute(
      `INSERT INTO audit_logs (user_id, action, target_type, target_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId || null, action, targetType, targetId || null, detailsJson, ipAddress || null]
    );
    return result.insertId;
  }

  async list(filters = {}, limit = 50, offset = 0, connection = null) {
    const client = connection || db;
    let query = `
      SELECT a.id, a.user_id, u.username, u.role, a.action, a.target_type, a.target_id, a.details, a.ip_address, a.created_at
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.action) {
      query += ' AND a.action = ?';
      params.push(filters.action);
    }
    if (filters.userId) {
      query += ' AND a.user_id = ?';
      params.push(filters.userId);
    }

    query += ' ORDER BY a.id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await client.execute(query, params);
    return rows;
  }

  async count(filters = {}, connection = null) {
    const client = connection || db;
    let query = 'SELECT COUNT(id) AS total FROM audit_logs WHERE 1=1';
    const params = [];

    if (filters.action) {
      query += ' AND action = ?';
      params.push(filters.action);
    }
    if (filters.userId) {
      query += ' AND user_id = ?';
      params.push(filters.userId);
    }

    const [rows] = await client.execute(query, params);
    return rows[0].total;
  }
}

module.exports = new AuditRepository();
