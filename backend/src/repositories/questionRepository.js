const db = require('../config/db');

/**
 * Question Repository - Data Access Layer for questions & choices
 */
class QuestionRepository {
  async listByTeacher(teacherId, filters = {}, connection = null) {
    const client = connection || db;
    let query = `
      SELECT q.id, q.title, q.content, q.question_type, q.subject, q.difficulty, q.status, q.created_at,
             COUNT(c.id) AS choice_count
      FROM questions q
      LEFT JOIN question_choices c ON q.id = c.question_id
      WHERE q.created_by = ? AND q.status = 'active'
    `;
    const params = [teacherId];

    if (filters.subject) {
      query += ' AND q.subject = ?';
      params.push(filters.subject);
    }
    if (filters.difficulty) {
      query += ' AND q.difficulty = ?';
      params.push(filters.difficulty);
    }
    if (filters.search) {
      query += ' AND (q.title LIKE ? OR q.content LIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    query += ' GROUP BY q.id ORDER BY q.id DESC';
    const [rows] = await client.execute(query, params);
    return rows;
  }

  async findByIdAndTeacher(questionId, teacherId, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      `SELECT id, created_by, title, content, question_type, subject, difficulty, status, created_at
       FROM questions
       WHERE id = ? AND created_by = ?`,
      [questionId, teacherId]
    );
    return rows[0] || null;
  }

  async getChoicesByQuestionId(questionId, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      `SELECT id, content, is_correct, sort_order
       FROM question_choices
       WHERE question_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [questionId]
    );
    return rows;
  }

  async createQuestionWithChoices(teacherId, questionData, choices, connection) {
    const { title, content, question_type, subject, difficulty } = questionData;
    const [result] = await connection.execute(
      `INSERT INTO questions (created_by, title, content, question_type, subject, difficulty, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [teacherId, title, content, question_type, subject || 'General', difficulty || 'medium']
    );
    const questionId = result.insertId;

    for (let i = 0; i < choices.length; i++) {
      const c = choices[i];
      await connection.execute(
        `INSERT INTO question_choices (question_id, content, is_correct, sort_order)
         VALUES (?, ?, ?, ?)`,
        [questionId, c.content, c.is_correct ? 1 : 0, i + 1]
      );
    }

    return questionId;
  }

  async updateQuestionWithChoices(questionId, teacherId, questionData, choices, connection) {
    const { title, content, question_type, subject, difficulty } = questionData;
    await connection.execute(
      `UPDATE questions
       SET title = ?, content = ?, question_type = ?, subject = ?, difficulty = ?
       WHERE id = ? AND created_by = ?`,
      [title, content, question_type, subject || 'General', difficulty || 'medium', questionId, teacherId]
    );

    // Delete existing choices and replace
    await connection.execute('DELETE FROM question_choices WHERE question_id = ?', [questionId]);

    for (let i = 0; i < choices.length; i++) {
      const c = choices[i];
      await connection.execute(
        `INSERT INTO question_choices (question_id, content, is_correct, sort_order)
         VALUES (?, ?, ?, ?)`,
        [questionId, c.content, c.is_correct ? 1 : 0, i + 1]
      );
    }

    return true;
  }

  async softDelete(questionId, teacherId, connection = null) {
    const client = connection || db;
    const [result] = await client.execute(
      `UPDATE questions SET status = 'archived' WHERE id = ? AND created_by = ?`,
      [questionId, teacherId]
    );
    return result.affectedRows > 0;
  }

  async isQuestionInActiveExams(questionId, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      `SELECT COUNT(eq.id) AS count
       FROM exam_questions eq
       JOIN exams e ON eq.exam_id = e.id
       WHERE eq.question_id = ? AND e.status = 'published'`,
      [questionId]
    );
    return rows[0].count > 0;
  }
}

module.exports = new QuestionRepository();
