const db = require('../config/db');

/**
 * User Repository - Data Access Layer for users
 */
class UserRepository {
  async findById(id, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      'SELECT id, username, email, full_name, role, status, created_at, updated_at FROM users WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  async findByIdWithPasswordHash(id, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      'SELECT id, username, email, password_hash, full_name, role, status, created_at, updated_at FROM users WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  async findByUsername(username, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      'SELECT id, username, email, password_hash, full_name, role, status FROM users WHERE username = ?',
      [username]
    );
    return rows[0] || null;
  }

  async findByEmail(email, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      'SELECT id, username, email, password_hash, full_name, role, status FROM users WHERE email = ?',
      [email]
    );
    return rows[0] || null;
  }

  async findByUsernameOrEmail(identifier, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      'SELECT id, username, email, password_hash, full_name, role, status FROM users WHERE username = ? OR email = ?',
      [identifier, identifier]
    );
    return rows[0] || null;
  }

  async create(user, connection = null) {
    const client = connection || db;
    const { username, email, passwordHash, fullName, role } = user;
    const [result] = await client.execute(
      `INSERT INTO users (username, email, password_hash, full_name, role, status)
       VALUES (?, ?, ?, ?, ?, 'active')`,
      [username, email, passwordHash, fullName, role]
    );
    return result.insertId;
  }

  async updatePassword(userId, newPasswordHash, connection = null) {
    const client = connection || db;
    const [result] = await client.execute(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newPasswordHash, userId]
    );
    return result.affectedRows > 0;
  }

  async updateStatus(userId, status, connection = null) {
    const client = connection || db;
    const [result] = await client.execute(
      'UPDATE users SET status = ? WHERE id = ?',
      [status, userId]
    );
    return result.affectedRows > 0;
  }
}

module.exports = new UserRepository();
