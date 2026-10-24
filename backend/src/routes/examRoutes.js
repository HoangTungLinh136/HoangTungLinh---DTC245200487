const express = require('express');
const router = express.Router();
const examController = require('../controllers/examController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

// Teacher exam management routes
router.use(authenticate, requireRole(['teacher']));

router.get('/', examController.listTeacherExams);
router.get('/:id', examController.getExamDetails);
router.post('/', examController.createExam);
router.put('/:id', examController.updateExam);
router.post('/:id/clone', examController.cloneExam);
router.patch('/:id/publication', examController.togglePublication);
router.get('/:id/results', examController.getExamResults);

module.exports = router;
