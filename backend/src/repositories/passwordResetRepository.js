const db = require('../config/db');

/**
 * Password Reset Repository - Data Access Layer for password_reset_tokens
 */
class PasswordResetRepository {
  async createToken(userId, tokenHash, expiresAt, connection = null) {
    const client = connection || db;
    const [result] = await client.execute(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, ?)`,
      [userId, tokenHash, expiresAt]
    );
    return result.insertId;
  }

  async findByTokenHashForUpdate(tokenHash, connection) {
    const [rows] = await connection.execute(
      `SELECT id, user_id, expires_at, used_at
       FROM password_reset_tokens
       WHERE token_hash = ? FOR UPDATE`,
      [tokenHash]
    );
    return rows[0] || null;
  }

  async markTokenUsed(tokenId, connection) {
    const [result] = await connection.execute(
      'UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?',
      [tokenId]
    );
    return result.affectedRows > 0;
  }

  async deleteExpiredTokens(connection = null) {
    const client = connection || db;
    const [result] = await client.execute(
      'DELETE FROM password_reset_tokens WHERE expires_at < CURRENT_TIMESTAMP'
    );
    return result.affectedRows;
  }
}

module.exports = new PasswordResetRepository();
