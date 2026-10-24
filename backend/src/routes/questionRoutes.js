const express = require('express');
const router = express.Router();
const questionController = require('../controllers/questionController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

// All question routes require authentication and teacher role
router.use(authenticate, requireRole(['teacher']));

router.get('/', questionController.listQuestions);
router.get('/:id', questionController.getQuestionById);
router.post('/', questionController.createQuestion);
router.put('/:id', questionController.updateQuestion);
router.delete('/:id', questionController.deleteQuestion);

module.exports = router;
