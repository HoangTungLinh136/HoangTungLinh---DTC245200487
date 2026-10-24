const db = require('../config/db');

/**
 * Admin Repository - Data Access Layer for administrative operations & statistics (TC-01 Option B)
 */
class AdminRepository {
  async listUsers(filters = {}, connection = null) {
    const client = connection || db;
    let query = `
      SELECT id, username, email, full_name, role, status, created_at, updated_at
      FROM users
      WHERE 1=1
    `;
    const params = [];

    if (filters.role) {
      query += ' AND role = ?';
      params.push(filters.role);
    }
    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.search) {
      query += ' AND (username LIKE ? OR email LIKE ? OR full_name LIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    query += ' ORDER BY id ASC';
    const [rows] = await client.execute(query, params);
    return rows;
  }

  async updateUserAccount(userId, fields = {}, connection = null) {
    const client = connection || db;
    const updates = [];
    const params = [];

    if (fields.status) {
      updates.push('status = ?');
      params.push(fields.status);
    }
    if (fields.role) {
      updates.push('role = ?');
      params.push(fields.role);
    }

    if (updates.length === 0) return false;

    params.push(userId);
    const [result] = await client.execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    return result.affectedRows > 0;
  }

  async getOperationalStats(connection = null) {
    const client = connection || db;

    const [userStats] = await client.execute(
      `SELECT
         COUNT(id) AS total_users,
         SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) AS student_count,
         SUM(CASE WHEN role = 'teacher' THEN 1 ELSE 0 END) AS teacher_count,
         SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admin_count,
         SUM(CASE WHEN status = 'locked' THEN 1 ELSE 0 END) AS locked_count
       FROM users`
    );

    const [examStats] = await client.execute(
      `SELECT
         COUNT(id) AS total_exams,
         SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published_exams,
         SUM(CASE WHEN access_type = 'public' THEN 1 ELSE 0 END) AS public_exams,
         SUM(CASE WHEN access_type = 'assigned' THEN 1 ELSE 0 END) AS assigned_exams
       FROM exams`
    );

    const [attemptStats] = await client.execute(
      `SELECT
         COUNT(id) AS total_attempts,
         SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_attempts,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_attempts,
         SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS expired_attempts
       FROM exam_attempts`
    );

    const [activeSessions] = await client.execute(
      'SELECT COUNT(id) AS count FROM user_sessions WHERE expires_at > CURRENT_TIMESTAMP'
    );

    const [questionStats] = await client.execute(
      `SELECT subject, difficulty, COUNT(id) AS count
       FROM questions
       GROUP BY subject, difficulty
       ORDER BY subject ASC, difficulty ASC`
    );

    return {
      users: userStats[0],
      exams: examStats[0],
      attempts: attemptStats[0],
      active_sessions: activeSessions[0].count,
      questions: questionStats
    };
  }
}

module.exports = new AdminRepository();
