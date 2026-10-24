const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/db');
const userRepo = require('../repositories/userRepository');
const sessionRepo = require('../repositories/sessionRepository');
const passwordResetRepo = require('../repositories/passwordResetRepository');
const auditRepo = require('../repositories/auditRepository');
const { generateSessionToken, hashToken } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../services/mailService');

/**
 * Register a new user (Student or Teacher) - BD-01
 */
async function register(req, res) {
  try {
    const { username, email, password, fullName, role } = req.body;

    if (!username || !email || !password || !fullName || !role) {
      return res.status(400).json({ error: 'All fields are required (username, email, password, fullName, role)' });
    }

    if (!['student', 'teacher'].includes(role)) {
      return res.status(400).json({ error: 'Role must be either "student" or "teacher"' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const existingUser = await userRepo.findByUsername(username);
    const existingEmail = await userRepo.findByEmail(email);

    if (existingUser || existingEmail) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUserId = await userRepo.create({
      username,
      email,
      passwordHash,
      fullName,
      role
    });

    await auditRepo.log(newUserId, 'USER_REGISTER', 'USER', newUserId, { username, role }, req.ip);

    return res.status(201).json({
      message: 'Registration successful. Account activated immediately.',
      user: {
        id: newUserId,
        username,
        email,
        fullName,
        role,
        status: 'active'
      }
    });
  } catch (error) {
    console.error('[AuthController.register] Error:', error.message);
    return res.status(500).json({ error: 'Internal server error during registration' });
  }
}

/**
 * Login user and issue session token
 */
async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await userRepo.findByUsernameOrEmail(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is locked. Please contact administrator.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    const rawToken = generateSessionToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await sessionRepo.createSession(
      user.id,
      tokenHash,
      expiresAt,
      req.ip || null,
      req.headers['user-agent'] || null
    );

    res.cookie('session_token', rawToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    await auditRepo.log(user.id, 'USER_LOGIN', 'USER', user.id, null, req.ip);

    return res.json({
      message: 'Login successful',
      token: rawToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    console.error('[AuthController.login] Error:', error.message);
    return res.status(500).json({ error: 'Internal server error during login' });
  }
}

/**
 * Logout and invalidate session
 */
async function logout(req, res) {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.cookies && req.cookies.session_token) {
      token = req.cookies.session_token;
    }

    if (token) {
      const tokenHash = hashToken(token);
      await sessionRepo.deleteByTokenHash(tokenHash);
    }

    res.clearCookie('session_token');
    return res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('[AuthController.logout] Error:', error.message);
    return res.status(500).json({ error: 'Internal error during logout' });
  }
}

/**
 * Get current user profile
 */
async function me(req, res) {
  return res.json({ user: req.user });
}

/**
 * Initiate password reset request (BD-11)
 */
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await userRepo.findByEmail(email);
    // Return uniform message to prevent enumeration
    if (!user) {
      return res.json({ message: 'If the email exists in our system, a reset link has been dispatched.' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await passwordResetRepo.createToken(user.id, tokenHash, expiresAt);

    // Send email asynchronously
    sendPasswordResetEmail(user.email, rawToken);

    await auditRepo.log(user.id, 'PASSWORD_RESET_REQUEST', 'USER', user.id, null, req.ip);

    return res.json({ message: 'If the email exists in our system, a reset link has been dispatched.' });
  } catch (error) {
    console.error('[AuthController.forgotPassword] Error:', error.message);
    return res.status(500).json({ error: 'Internal error processing request' });
  }
}

/**
 * Complete password reset with token (BD-11, IA01-F08 single-use & concurrency safe)
 */
async function resetPassword(req, res) {
  const connection = await db.getConnection();
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and newPassword are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    await connection.beginTransaction();

    const tokenHash = hashToken(token);

    // Query active unused token with row lock (FOR UPDATE)
    const resetTokenRecord = await passwordResetRepo.findByTokenHashForUpdate(tokenHash, connection);

    if (!resetTokenRecord) {
      await connection.rollback();
      return res.status(400).json({ error: 'Invalid or expired password reset link' });
    }

    // Concurrency / Replay Check: If already used, reject immediately
    if (resetTokenRecord.used_at !== null) {
      await connection.rollback();
      return res.status(400).json({ error: 'This reset token has already been used' });
    }

    // Check expiration
    if (new Date(resetTokenRecord.expires_at) < new Date()) {
      await connection.rollback();
      return res.status(400).json({ error: 'Password reset link has expired' });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await userRepo.updatePassword(resetTokenRecord.user_id, newPasswordHash, connection);

    // Mark token as used
    await passwordResetRepo.markTokenUsed(resetTokenRecord.id, connection);

    // Invalidate all active sessions for this user
    await sessionRepo.deleteByUserId(resetTokenRecord.user_id, connection);

    await connection.commit();

    await auditRepo.log(resetTokenRecord.user_id, 'PASSWORD_RESET_COMPLETE', 'USER', resetTokenRecord.user_id, null, req.ip);

    return res.json({ message: 'Password reset successful. Please log in with your new password.' });
  } catch (error) {
    await connection.rollback();
    console.error('[AuthController.resetPassword] Error:', error.message);
    return res.status(500).json({ error: 'Internal error resetting password' });
  } finally {
    connection.release();
  }
}

/**
 * Change password for authenticated user (BE-01)
 */
async function changePassword(req, res) {
  const connection = await db.getConnection();
  try {
    const userId = req.user.id;
    const currentPassword = req.body.currentPassword || req.body.oldPassword;
    const newPassword = req.body.newPassword;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Mật khẩu hiện tại và mật khẩu mới là bắt buộc' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }

    if (newPassword === currentPassword) {
      return res.status(400).json({ error: 'Mật khẩu mới phải khác mật khẩu hiện tại' });
    }

    await connection.beginTransaction();

    const user = await userRepo.findByIdWithPasswordHash(userId, connection);
    if (!user) {
      await connection.rollback();
      return res.status(404).json({ error: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      await connection.rollback();
      return res.status(400).json({ error: 'Mật khẩu hiện tại không chính xác' });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await userRepo.updatePassword(userId, newPasswordHash, connection);

    // Revoke all existing sessions for this user upon password change (BE-01, Task 3)
    await sessionRepo.deleteByUserId(userId, connection);

    await connection.commit();
    await auditRepo.log(userId, 'USER_PASSWORD_CHANGE', 'USER', userId, null, req.ip);

    return res.json({ message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    await connection.rollback();
    console.error('[AuthController.changePassword] Error:', error.message);
    return res.status(500).json({ error: 'Internal error changing password' });
  } finally {
    connection.release();
  }
}

module.exports = {
  register,
  login,
  logout,
  me,
  forgotPassword,
  resetPassword,
  changePassword
};
