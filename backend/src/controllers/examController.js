const db = require('../config/db');
const examRepo = require('../repositories/examRepository');
const auditRepo = require('../repositories/auditRepository');

/**
 * List exams created by teacher
 */
async function listTeacherExams(req, res) {
  try {
    const teacherId = req.user.id;
    const exams = await examRepo.listByTeacher(teacherId);
    return res.json({ exams });
  } catch (error) {
    console.error('[ExamController.listTeacherExams] Error:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve exams' });
  }
}

/**
 * Get exam details with question bank and assigned students
 */
async function getExamDetails(req, res) {
  try {
    const examId = parseInt(req.params.id, 10);
    const teacherId = req.user.id;

    const exam = await examRepo.findByIdAndTeacher(examId, teacherId);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found or unauthorized' });
    }

    const attemptCount = await examRepo.countAttemptsForExam(examId);
    exam.hasAttempts = attemptCount > 0;

    exam.questions = await examRepo.getExamQuestions(examId);

    if (exam.access_type === 'assigned') {
      exam.assignedStudents = await examRepo.getAssignedStudents(examId);
    }

    return res.json({ exam });
  } catch (error) {
    console.error('[ExamController.getExamDetails] Error:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve exam details' });
  }
}

/**
 * Create a new exam
 */
async function createExam(req, res) {
  const connection = await db.getConnection();
  try {
    const teacherId = req.user.id;
    const {
      title, description, duration_minutes, max_attempts, pass_score,
      access_type, questions, assigned_student_ids, start_time, end_time
    } = req.body;

    if (!title || !duration_minutes || !questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'Title, duration and at least one question are required' });
    }

    await connection.beginTransaction();

    const examId = await examRepo.createExam(
      teacherId,
      { title, description, duration_minutes, max_attempts, pass_score, access_type, start_time, end_time },
      questions,
      assigned_student_ids,
      connection
    );

    await connection.commit();
    await auditRepo.log(teacherId, 'CREATE_EXAM', 'EXAM', examId, { title, access_type }, req.ip);

    return res.status(201).json({
      message: 'Exam created successfully',
      examId
    });
  } catch (error) {
    await connection.rollback();
    console.error('[ExamController.createExam] Error:', error.message);
    return res.status(500).json({ error: 'Failed to create exam' });
  } finally {
    connection.release();
  }
}

/**
 * Update an existing draft/unattempted exam (BD-03, P1)
 */
async function updateExam(req, res) {
  try {
    const examId = parseInt(req.params.id, 10);
    const teacherId = req.user.id;

    const exam = await examRepo.findByIdAndTeacher(examId, teacherId);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found or unauthorized' });
    }

    // BD-03 Immutability Check: If attempts have been taken, exam structure cannot be modified
    const attemptCount = await examRepo.countAttemptsForExam(examId);
    if (attemptCount > 0) {
      return res.status(403).json({
        error: 'BD-03: Exam has existing attempts and cannot be modified. Please clone the exam to make changes.'
      });
    }

    const {
      title, description, duration_minutes, max_attempts, pass_score,
      access_type, start_time, end_time
    } = req.body;

    if (!title || !duration_minutes) {
      return res.status(400).json({ error: 'Title and duration are required' });
    }

    await examRepo.updateDraftExam(examId, teacherId, {
      title,
      description,
      duration_minutes,
      max_attempts: (max_attempts !== undefined && max_attempts !== null && max_attempts !== '') ? parseInt(max_attempts, 10) : exam.max_attempts,
      pass_score: pass_score || exam.pass_score,
      access_type: access_type || exam.access_type,
      start_time,
      end_time
    });

    await auditRepo.log(teacherId, 'UPDATE_EXAM', 'EXAM', examId, { title }, req.ip);

    return res.json({ message: 'Exam updated successfully', examId });
  } catch (error) {
    console.error('[ExamController.updateExam] Error:', error.message);
    return res.status(500).json({ error: 'Failed to update exam' });
  }
}

/**
 * Clone exam to new version (BD-03 Exam Immutability)
 */
async function cloneExam(req, res) {
  const connection = await db.getConnection();
  try {
    const originalExamId = parseInt(req.params.id, 10);
    const teacherId = req.user.id;

    const orig = await examRepo.findByIdAndTeacher(originalExamId, teacherId);
    if (!orig) {
      return res.status(404).json({ error: 'Original exam not found or unauthorized' });
    }

    const newTitle = `${orig.title} (Bản sao ${new Date().toISOString().slice(0, 10)})`;

    await connection.beginTransaction();

    const newExamId = await examRepo.cloneExam(originalExamId, teacherId, newTitle, connection);

    await connection.commit();
    await auditRepo.log(teacherId, 'CLONE_EXAM', 'EXAM', newExamId, { originalExamId, newTitle }, req.ip);

    return res.status(201).json({
      message: 'Exam cloned successfully',
      clonedExamId: newExamId
    });
  } catch (error) {
    await connection.rollback();
    console.error('[ExamController.cloneExam] Error:', error.message);
    return res.status(500).json({ error: 'Failed to clone exam' });
  } finally {
    connection.release();
  }
}

/**
 * Toggle publication of scores and answers (BD-06)
 */
async function togglePublication(req, res) {
  try {
    const examId = parseInt(req.params.id, 10);
    const teacherId = req.user.id;
    const { is_published_scores, is_published_answers } = req.body;

    const exam = await examRepo.findByIdAndTeacher(examId, teacherId);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found or unauthorized' });
    }

    const updated = await examRepo.updatePublication(examId, teacherId, is_published_scores, is_published_answers);
    if (!updated) {
      return res.status(400).json({ error: 'No publication settings provided' });
    }

    await auditRepo.log(teacherId, 'TOGGLE_PUBLICATION', 'EXAM', examId, { is_published_scores, is_published_answers }, req.ip);

    return res.json({ message: 'Exam publication settings updated' });
  } catch (error) {
    console.error('[ExamController.togglePublication] Error:', error.message);
    return res.status(500).json({ error: 'Failed to update publication settings' });
  }
}

/**
 * Get results of all attempts for an exam (Teacher view)
 */
async function getExamResults(req, res) {
  try {
    const examId = parseInt(req.params.id, 10);
    const teacherId = req.user.id;

    const exam = await examRepo.findByIdAndTeacher(examId, teacherId);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found or unauthorized' });
    }

    const attempts = await examRepo.getExamResults(examId, teacherId);

    return res.json({
      examTitle: exam.title,
      attempts
    });
  } catch (error) {
    console.error('[ExamController.getExamResults] Error:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve exam results' });
  }
}

module.exports = {
  listTeacherExams,
  getExamDetails,
  createExam,
  updateExam,
  cloneExam,
  togglePublication,
  getExamResults
};
