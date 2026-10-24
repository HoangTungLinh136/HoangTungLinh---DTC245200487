const crypto = require('crypto');
const db = require('../config/db');

/**
 * Authentication middleware
 * Supports Bearer token in Authorization header or session_token cookie
 */
async function authenticate(req, res, next) {
  let token = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.cookies && req.cookies.session_token) {
    token = req.cookies.session_token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    // Hash token to query user_sessions (SHA-256 for secure lookup)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const [sessions] = await db.execute(
      `SELECT s.id AS session_id, s.user_id, s.expires_at,
              u.username, u.email, u.full_name, u.role, u.status
       FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP`,
      [tokenHash]
    );

    if (sessions.length === 0) {
      return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
    }

    const session = sessions[0];

    if (session.status !== 'active') {
      return res.status(403).json({ error: 'Account is locked or inactive. Contact administrator.' });
    }

    req.user = {
      id: session.user_id,
      username: session.username,
      email: session.email,
      fullName: session.full_name,
      role: session.role,
      status: session.status,
      sessionId: session.session_id
    };

    next();
  } catch (error) {
    console.error('[AuthMiddleware] Error:', error.message);
    return res.status(500).json({ error: 'Internal authentication error' });
  }
}

/**
 * Helper to generate a new random session token
 */
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Helper to compute token hash
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  authenticate,
  generateSessionToken,
  hashToken
};
