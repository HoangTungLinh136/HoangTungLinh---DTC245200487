const db = require('../config/db');

/**
 * Attempt Repository - Data Access Layer for exam_attempts, snapshots & answers
 */
class AttemptRepository {
  async findActiveAttempt(studentId, examId, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      `SELECT id, exam_id, student_id, attempt_number, started_at, deadline_at, status
       FROM exam_attempts
       WHERE student_id = ? AND exam_id = ? AND status = 'in_progress' FOR UPDATE`,
      [studentId, examId]
    );
    return rows[0] || null;
  }

  async countAttempts(studentId, examId, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      'SELECT COUNT(id) AS taken FROM exam_attempts WHERE student_id = ? AND exam_id = ?',
      [studentId, examId]
    );
    return rows[0].taken;
  }

  async createAttempt(examId, studentId, attemptNumber, startedAt, deadlineAt, connection) {
    const [result] = await connection.execute(
      `INSERT INTO exam_attempts (exam_id, student_id, attempt_number, status, started_at, deadline_at)
       VALUES (?, ?, ?, 'in_progress', ?, ?)`,
      [examId, studentId, attemptNumber, startedAt, deadlineAt]
    );
    return result.insertId;
  }

  async saveSnapshot(attemptId, questionId, questionOrder, questionType, weight, snapshotData, connection) {
    const [result] = await connection.execute(
      `INSERT INTO attempt_question_snapshots (attempt_id, question_id, question_order, question_type, weight, snapshot_data)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [attemptId, questionId, questionOrder, questionType, weight, JSON.stringify(snapshotData)]
    );
    return result.insertId;
  }

  async getSnapshots(attemptId, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      `SELECT question_id, question_order, question_type, weight, snapshot_data
       FROM attempt_question_snapshots
       WHERE attempt_id = ?
       ORDER BY question_order ASC`,
      [attemptId]
    );
    return rows;
  }

  async getDraftAnswers(attemptId, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      `SELECT question_id, selected_choice_ids, revision
       FROM attempt_answers
       WHERE attempt_id = ?`,
      [attemptId]
    );
    return rows;
  }

  async saveDraftAnswer(attemptId, questionId, choiceIdsJson, clientRevision = null, connection = null) {
    const client = connection || db;
    if (clientRevision !== null && clientRevision !== undefined) {
      const revNum = parseInt(clientRevision, 10) || 1;
      const [result] = await client.execute(
        `INSERT INTO attempt_answers (attempt_id, question_id, selected_choice_ids, revision)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           selected_choice_ids = IF(VALUES(revision) >= attempt_answers.revision, VALUES(selected_choice_ids), attempt_answers.selected_choice_ids),
           answered_at = IF(VALUES(revision) >= attempt_answers.revision, CURRENT_TIMESTAMP, attempt_answers.answered_at),
           revision = GREATEST(attempt_answers.revision, VALUES(revision))`,
        [attemptId, questionId, choiceIdsJson, revNum]
      );
      return result;
    } else {
      const [result] = await client.execute(
        `INSERT INTO attempt_answers (attempt_id, question_id, selected_choice_ids, revision)
         VALUES (?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           selected_choice_ids = VALUES(selected_choice_ids),
           revision = revision + 1,
           answered_at = CURRENT_TIMESTAMP`,
        [attemptId, questionId, choiceIdsJson]
      );
      return result;
    }
  }

  async findById(attemptId, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      `SELECT id, exam_id, student_id, attempt_number, status, grading_status,
              grading_fencing_token, grading_lease_expires_at, raw_score, score,
              started_at, submitted_at, deadline_at
       FROM exam_attempts
       WHERE id = ?`,
      [attemptId]
    );
    return rows[0] || null;
  }

  async findByIdForUpdate(attemptId, connection) {
    const [rows] = await connection.execute(
      `SELECT id, exam_id, student_id, attempt_number, status, grading_status,
              grading_fencing_token, grading_lease_expires_at, raw_score, score,
              started_at, submitted_at, deadline_at
       FROM exam_attempts
       WHERE id = ? FOR UPDATE`,
      [attemptId]
    );
    return rows[0] || null;
  }

  async updateStatus(attemptId, status, submittedAt = null, connection = null) {
    const client = connection || db;
    const [result] = await client.execute(
      `UPDATE exam_attempts
       SET status = ?,
           submitted_at = COALESCE(?, CURRENT_TIMESTAMP)
       WHERE id = ? AND status = 'in_progress'`,
      [status, submittedAt, attemptId]
    );
    return result.affectedRows > 0;
  }

  async listStudentAttempts(studentId, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      `SELECT a.id, a.exam_id, a.attempt_number, a.status, a.score, a.started_at, a.submitted_at,
              e.title AS exam_title, e.pass_score, e.is_published_scores, e.is_published_answers
       FROM exam_attempts a
       JOIN exams e ON a.exam_id = e.id
       WHERE a.student_id = ?
       ORDER BY a.started_at DESC`,
      [studentId]
    );
    return rows;
  }

  async getAttemptWithExamMeta(attemptId, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      `SELECT a.id, a.exam_id, a.student_id, a.attempt_number, a.status,
              a.raw_score, a.score, a.started_at, a.submitted_at, a.deadline_at,
              e.title AS exam_title, e.pass_score, e.is_published_scores, e.is_published_answers,
              u.full_name AS student_name, e.created_by AS teacher_id
       FROM exam_attempts a
       JOIN exams e ON a.exam_id = e.id
       JOIN users u ON a.student_id = u.id
       WHERE a.id = ?`,
      [attemptId]
    );
    return rows[0] || null;
  }

  async findExpiredInProgress(limit = 50, connection = null) {
    const client = connection || db;
    const safeLimit = parseInt(limit, 10) || 50;
    const [rows] = await client.execute(
      `SELECT id, student_id, exam_id, deadline_at
       FROM exam_attempts
       WHERE status = 'in_progress' AND deadline_at < CURRENT_TIMESTAMP
       LIMIT ${safeLimit}`
    );
    return rows;
  }

  async findStaleGradingAttempts(limit = 50, connection = null) {
    const client = connection || db;
    const safeLimit = parseInt(limit, 10) || 50;
    const [rows] = await client.execute(
      `SELECT id, student_id, exam_id, grading_status, grading_lease_expires_at, grading_fencing_token
       FROM exam_attempts
       WHERE status IN ('completed', 'expired')
         AND (grading_status = 'ungraded' OR (grading_status = 'grading' AND grading_lease_expires_at < CURRENT_TIMESTAMP))
       LIMIT ${safeLimit}`
    );
    return rows;
  }
}

module.exports = new AttemptRepository();
