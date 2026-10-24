const express = require('express');
const router = express.Router();
const attemptController = require('../controllers/attemptController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

// Attempt routes require authentication
router.use(authenticate);

// Student specific routes
router.get('/available-exams', requireRole(['student']), attemptController.listAvailableExams);
router.get('/my-attempts', requireRole(['student']), attemptController.listStudentAttempts);
router.post('/start', requireRole(['student']), attemptController.startOrResumeAttempt);
router.post('/:id/draft', requireRole(['student']), attemptController.saveDraft);
router.post('/:id/submit', requireRole(['student']), attemptController.submitAttempt);

// Student or Teacher can view result (checked inside controller)
router.get('/:id/result', requireRole(['student', 'teacher']), attemptController.getAttemptResult);

module.exports = router;
