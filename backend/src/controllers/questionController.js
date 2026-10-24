const db = require('../config/db');
const questionRepo = require('../repositories/questionRepository');
const auditRepo = require('../repositories/auditRepository');

/**
 * List questions created by teacher
 */
async function listQuestions(req, res) {
  try {
    const teacherId = req.user.id;
    const { subject, difficulty, search } = req.query;

    const questions = await questionRepo.listByTeacher(teacherId, { subject, difficulty, search });
    return res.json({ questions });
  } catch (error) {
    console.error('[QuestionController.listQuestions] Error:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve questions' });
  }
}

/**
 * Get question details with choices
 */
async function getQuestionById(req, res) {
  try {
    const questionId = parseInt(req.params.id, 10);
    const teacherId = req.user.id;

    const question = await questionRepo.findByIdAndTeacher(questionId, teacherId);
    if (!question) {
      return res.status(404).json({ error: 'Question not found or unauthorized' });
    }

    question.choices = await questionRepo.getChoicesByQuestionId(questionId);
    return res.json({ question });
  } catch (error) {
    console.error('[QuestionController.getQuestionById] Error:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve question details' });
  }
}

/**
 * Create a new question with choices
 */
async function createQuestion(req, res) {
  const connection = await db.getConnection();
  try {
    const teacherId = req.user.id;
    const { title, content, question_type, subject, difficulty, choices } = req.body;

    if (!title || !content || !question_type || !choices || !Array.isArray(choices)) {
      return res.status(400).json({ error: 'Missing required question fields or choices' });
    }

    if (!['single_choice', 'multiple_choice'].includes(question_type)) {
      return res.status(400).json({ error: 'question_type must be "single_choice" or "multiple_choice"' });
    }

    if (choices.length < 2) {
      return res.status(400).json({ error: 'Question must have at least 2 choices' });
    }

    const correctCount = choices.filter(c => c.is_correct).length;
    if (correctCount === 0) {
      return res.status(400).json({ error: 'Question must have at least one correct choice' });
    }

    if (question_type === 'single_choice' && correctCount > 1) {
      return res.status(400).json({ error: 'Single choice question cannot have more than 1 correct choice' });
    }

    await connection.beginTransaction();

    const questionId = await questionRepo.createQuestionWithChoices(
      teacherId,
      { title, content, question_type, subject, difficulty },
      choices,
      connection
    );

    await connection.commit();
    await auditRepo.log(teacherId, 'CREATE_QUESTION', 'QUESTION', questionId, { title, question_type }, req.ip);

    return res.status(201).json({
      message: 'Question created successfully',
      questionId
    });
  } catch (error) {
    await connection.rollback();
    console.error('[QuestionController.createQuestion] Error:', error.message);
    return res.status(500).json({ error: 'Failed to create question' });
  } finally {
    connection.release();
  }
}

/**
 * Update an existing question
 */
async function updateQuestion(req, res) {
  const connection = await db.getConnection();
  try {
    const questionId = parseInt(req.params.id, 10);
    const teacherId = req.user.id;
    const { title, content, question_type, subject, difficulty, choices } = req.body;

    const existing = await questionRepo.findByIdAndTeacher(questionId, teacherId);
    if (!existing) {
      return res.status(404).json({ error: 'Question not found or unauthorized' });
    }

    if (!title || !content || !question_type || !choices || !Array.isArray(choices)) {
      return res.status(400).json({ error: 'Missing required question fields or choices' });
    }

    const correctCount = choices.filter(c => c.is_correct).length;
    if (correctCount === 0) {
      return res.status(400).json({ error: 'Question must have at least one correct choice' });
    }

    if (question_type === 'single_choice' && correctCount > 1) {
      return res.status(400).json({ error: 'Single choice question cannot have more than 1 correct choice' });
    }

    await connection.beginTransaction();

    await questionRepo.updateQuestionWithChoices(
      questionId,
      teacherId,
      { title, content, question_type, subject, difficulty },
      choices,
      connection
    );

    await connection.commit();
    await auditRepo.log(teacherId, 'UPDATE_QUESTION', 'QUESTION', questionId, { title }, req.ip);

    return res.json({ message: 'Question updated successfully', questionId });
  } catch (error) {
    await connection.rollback();
    console.error('[QuestionController.updateQuestion] Error:', error.message);
    return res.status(500).json({ error: 'Failed to update question' });
  } finally {
    connection.release();
  }
}

/**
 * Soft delete question (archive)
 */
async function deleteQuestion(req, res) {
  try {
    const questionId = parseInt(req.params.id, 10);
    const teacherId = req.user.id;

    const existing = await questionRepo.findByIdAndTeacher(questionId, teacherId);
    if (!existing) {
      return res.status(404).json({ error: 'Question not found or unauthorized' });
    }

    const inActiveExams = await questionRepo.isQuestionInActiveExams(questionId);
    if (inActiveExams) {
      return res.status(400).json({
        error: 'Cannot delete question currently linked to active/published exams.'
      });
    }

    await questionRepo.softDelete(questionId, teacherId);
    await auditRepo.log(teacherId, 'DELETE_QUESTION', 'QUESTION', questionId, null, req.ip);

    return res.json({ message: 'Question deleted (archived) successfully' });
  } catch (error) {
    console.error('[QuestionController.deleteQuestion] Error:', error.message);
    return res.status(500).json({ error: 'Failed to delete question' });
  }
}

module.exports = {
  listQuestions,
  getQuestionById,
  createQuestion,
  updateQuestion,
  deleteQuestion
};
