const rateLimit = require('express-rate-limit');

/**
 * Rate Limiting Middleware for Authentication Endpoints (SEC-02)
 * Designed for single-instance demo & production resilience.
 */

// 1. Login Rate Limiter: max 10 failed login attempts per 15 minutes per IP
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skipSuccessfulRequests: true, // Successful logins do NOT consume the rate limit
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).json({
      error: 'Quá nhiều lần thử đăng nhập thất bại. Vui lòng thử lại sau 15 phút.',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }
});

// 2. Registration Rate Limiter: max 10 registration requests per hour per IP
const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).json({
      error: 'Quá nhiều yêu cầu đăng ký từ địa chỉ này. Vui lòng thử lại sau 1 giờ.',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }
});

// 3. Forgot Password Rate Limiter: max 5 reset requests per hour per IP
const forgotPasswordRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).json({
      error: 'Quá nhiều yêu cầu khôi phục mật khẩu từ địa chỉ này. Vui lòng thử lại sau 1 giờ.',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }
});

module.exports = {
  loginRateLimiter,
  registerRateLimiter,
  forgotPasswordRateLimiter
};
