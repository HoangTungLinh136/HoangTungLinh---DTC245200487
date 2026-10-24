const db = require('../config/db');

/**
 * Session Repository - Data Access Layer for user_sessions
 */
class SessionRepository {
  async createSession(userId, tokenHash, expiresAt, ipAddress = null, userAgent = null, connection = null) {
    const client = connection || db;
    const [result] = await client.execute(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, tokenHash, expiresAt, ipAddress, userAgent]
    );
    return result.insertId;
  }

  async findActiveByTokenHash(tokenHash, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      `SELECT s.id AS session_id, s.user_id, s.expires_at,
              u.username, u.email, u.full_name, u.role, u.status
       FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP`,
      [tokenHash]
    );
    return rows[0] || null;
  }

  async deleteByTokenHash(tokenHash, connection = null) {
    const client = connection || db;
    const [result] = await client.execute(
      'DELETE FROM user_sessions WHERE token_hash = ?',
      [tokenHash]
    );
    return result.affectedRows > 0;
  }

  async deleteByUserId(userId, connection = null) {
    const client = connection || db;
    const [result] = await client.execute(
      'DELETE FROM user_sessions WHERE user_id = ?',
      [userId]
    );
    return result.affectedRows;
  }

  async deleteExpiredSessions(connection = null) {
    const client = connection || db;
    const [result] = await client.execute(
      'DELETE FROM user_sessions WHERE expires_at < CURRENT_TIMESTAMP'
    );
    return result.affectedRows;
  }
}

module.exports = new SessionRepository();
