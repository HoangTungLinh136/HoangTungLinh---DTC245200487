const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const {
  loginRateLimiter,
  registerRateLimiter,
  forgotPasswordRateLimiter
} = require('../middleware/rateLimiter');

router.post('/register', registerRateLimiter, authController.register);
router.post('/login', loginRateLimiter, authController.login);
router.post('/logout', authController.logout);
router.post('/forgot-password', forgotPasswordRateLimiter, authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/change-password', authenticate, authController.changePassword);
router.get('/me', authenticate, authController.me);

module.exports = router;
