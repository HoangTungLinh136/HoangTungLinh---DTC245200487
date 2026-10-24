const db = require('../config/db');

/**
 * Exam Repository - Data Access Layer for exams, assignments & exam questions
 */
class ExamRepository {
  async listAvailableForStudent(studentId, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      `SELECT e.id, e.title, e.description, e.duration_minutes, e.max_attempts, e.pass_score,
              e.access_type, e.status, e.is_published_scores, e.is_published_answers,
              e.start_time, e.end_time,
              u.full_name AS teacher_name,
              COUNT(DISTINCT a.id) AS attempts_taken,
              MAX(CASE WHEN a.status = 'in_progress' THEN a.id ELSE NULL END) AS active_attempt_id
       FROM exams e
       JOIN users u ON e.created_by = u.id
       LEFT JOIN exam_assignments ea ON e.id = ea.exam_id
       LEFT JOIN exam_attempts a ON e.id = a.exam_id AND a.student_id = ?
       WHERE e.status = 'published'
         AND (e.access_type = 'public' OR (e.access_type = 'assigned' AND ea.student_id = ?))
       GROUP BY e.id
       ORDER BY e.id DESC`,
      [studentId, studentId]
    );
    return rows;
  }

  async listByTeacher(teacherId, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      `SELECT e.id, e.title, e.description, e.duration_minutes, e.max_attempts, e.pass_score,
              e.access_type, e.status, e.is_published_scores, e.is_published_answers,
              e.start_time, e.end_time, e.created_at,
              COUNT(DISTINCT eq.question_id) AS question_count,
              COUNT(DISTINCT a.id) AS attempt_count,
              AVG(a.score) AS average_score
       FROM exams e
       LEFT JOIN exam_questions eq ON e.id = eq.exam_id
       LEFT JOIN exam_attempts a ON e.id = a.exam_id AND a.status IN ('completed', 'expired')
       WHERE e.created_by = ?
       GROUP BY e.id
       ORDER BY e.id DESC`,
      [teacherId]
    );
    return rows;
  }

  async findByIdAndTeacher(examId, teacherId, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      `SELECT id, created_by, title, description, duration_minutes, max_attempts, pass_score,
              access_type, status, is_published_scores, is_published_answers,
              start_time, end_time, created_at
       FROM exams
       WHERE id = ? AND created_by = ?`,
      [examId, teacherId]
    );
    return rows[0] || null;
  }

  async findByIdForUpdate(examId, connection) {
    const [rows] = await connection.execute(
      `SELECT id, created_by, title, duration_minutes, max_attempts, pass_score, access_type, status, start_time, end_time
       FROM exams WHERE id = ? FOR UPDATE`,
      [examId]
    );
    return rows[0] || null;
  }

  async countAttemptsForExam(examId, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      'SELECT COUNT(id) AS count FROM exam_attempts WHERE exam_id = ?',
      [examId]
    );
    return rows[0].count;
  }

  async isStudentAssigned(examId, studentId, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      'SELECT id FROM exam_assignments WHERE exam_id = ? AND student_id = ?',
      [examId, studentId]
    );
    return rows.length > 0;
  }

  async getExamQuestions(examId, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      `SELECT eq.question_id, eq.question_order, eq.weight,
              q.title, q.content, q.question_type, q.subject, q.difficulty
       FROM exam_questions eq
       JOIN questions q ON eq.question_id = q.id
       WHERE eq.exam_id = ?
       ORDER BY eq.question_order ASC`,
      [examId]
    );
    return rows;
  }

  async getAssignedStudents(examId, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      `SELECT u.id AS student_id, u.username, u.full_name, u.email
       FROM exam_assignments ea
       JOIN users u ON ea.student_id = u.id
       WHERE ea.exam_id = ?`,
      [examId]
    );
    return rows;
  }

  async createExam(teacherId, examData, questions, assignedStudentIds, connection) {
    const {
      title, description, duration_minutes, max_attempts, pass_score,
      access_type, start_time, end_time
    } = examData;

    const [examResult] = await connection.execute(
      `INSERT INTO exams (created_by, title, description, duration_minutes, max_attempts, pass_score,
                          access_type, status, is_published_scores, is_published_answers, start_time, end_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'published', 0, 0, ?, ?)`,
      [
        teacherId,
        title,
        description || null,
        parseInt(duration_minutes, 10),
        (max_attempts !== undefined && max_attempts !== null && max_attempts !== '') ? parseInt(max_attempts, 10) : 1,
        parseFloat(pass_score || 5.0),
        access_type || 'public',
        start_time || null,
        end_time || null
      ]
    );

    const examId = examResult.insertId;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const weight = parseFloat(q.weight) > 0 ? parseFloat(q.weight) : 1.0;
      await connection.execute(
        `INSERT INTO exam_questions (exam_id, question_id, question_order, weight)
         VALUES (?, ?, ?, ?)`,
        [examId, q.question_id, i + 1, weight]
      );
    }

    if (access_type === 'assigned' && assignedStudentIds && Array.isArray(assignedStudentIds)) {
      for (const studentId of assignedStudentIds) {
        await connection.execute(
          `INSERT INTO exam_assignments (exam_id, student_id)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE assigned_at = CURRENT_TIMESTAMP`,
          [examId, studentId]
        );
      }
    }

    return examId;
  }

  async updateDraftExam(examId, teacherId, examData, connection = null) {
    const client = connection || db;
    const {
      title, description, duration_minutes, max_attempts, pass_score,
      access_type, start_time, end_time
    } = examData;

    const [result] = await client.execute(
      `UPDATE exams
       SET title = ?, description = ?, duration_minutes = ?, max_attempts = ?, pass_score = ?,
           access_type = ?, start_time = ?, end_time = ?
       WHERE id = ? AND created_by = ?`,
      [
        title,
        description || null,
        parseInt(duration_minutes, 10),
        parseInt(max_attempts, 10),
        parseFloat(pass_score),
        access_type,
        start_time || null,
        end_time || null,
        examId,
        teacherId
      ]
    );
    return result.affectedRows > 0;
  }

  async cloneExam(originalExamId, teacherId, newTitle, connection) {
    const [exams] = await connection.execute(
      'SELECT * FROM exams WHERE id = ? AND created_by = ?',
      [originalExamId, teacherId]
    );
    if (exams.length === 0) return null;

    const orig = exams[0];

    const [result] = await connection.execute(
      `INSERT INTO exams (created_by, title, description, duration_minutes, max_attempts, pass_score,
                          access_type, status, is_published_scores, is_published_answers)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 0, 0)`,
      [
        teacherId,
        newTitle,
        orig.description,
        orig.duration_minutes,
        orig.max_attempts,
        orig.pass_score,
        orig.access_type
      ]
    );
    const newExamId = result.insertId;

    await connection.execute(
      `INSERT INTO exam_questions (exam_id, question_id, question_order, weight)
       SELECT ?, question_id, question_order, weight
       FROM exam_questions
       WHERE exam_id = ?`,
      [newExamId, originalExamId]
    );

    if (orig.access_type === 'assigned') {
      await connection.execute(
        `INSERT INTO exam_assignments (exam_id, student_id)
         SELECT ?, student_id
         FROM exam_assignments
         WHERE exam_id = ?`,
        [newExamId, originalExamId]
      );
    }

    return newExamId;
  }

  async updatePublication(examId, teacherId, isPublishedScores, isPublishedAnswers, connection = null) {
    const client = connection || db;
    const updates = [];
    const params = [];

    if (isPublishedScores !== undefined) {
      updates.push('is_published_scores = ?');
      params.push(isPublishedScores ? 1 : 0);
    }
    if (isPublishedAnswers !== undefined) {
      updates.push('is_published_answers = ?');
      params.push(isPublishedAnswers ? 1 : 0);
    }

    if (updates.length === 0) return false;

    params.push(examId, teacherId);
    const [result] = await client.execute(
      `UPDATE exams SET ${updates.join(', ')} WHERE id = ? AND created_by = ?`,
      params
    );
    return result.affectedRows > 0;
  }

  async getExamResults(examId, teacherId, connection = null) {
    const client = connection || db;
    const [attempts] = await client.execute(
      `SELECT a.id, a.student_id, u.full_name AS student_name, u.username AS student_username,
              a.attempt_number, a.status, a.raw_score, a.score, a.started_at, a.submitted_at, a.deadline_at
       FROM exam_attempts a
       JOIN users u ON a.student_id = u.id
       WHERE a.exam_id = ?
       ORDER BY a.started_at DESC`,
      [examId]
    );
    return attempts;
  }

  async listActiveStudents(connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      `SELECT id, username, full_name, email
       FROM users
       WHERE role = 'student' AND status = 'active'
       ORDER BY full_name ASC`
    );
    return rows;
  }
}

module.exports = new ExamRepository();
