const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Ensure DB_PORT and NODE_ENV are configured for tests
process.env.NODE_ENV = 'test';
process.env.DB_PORT = process.env.DB_PORT || '3307';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'QuizPass123!';
const app = require('../src/server');
const db = require('../src/config/db');
const { generateSessionToken, hashToken } = require('../src/middleware/auth');
const userRepo = require('../src/repositories/userRepository');
const sessionRepo = require('../src/repositories/sessionRepository');

test('Batch 01 Security Remediation Verification Suite', async (suite) => {
  let server;
  let baseUrl;

  // Start Express on an OS-assigned ephemeral port
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  suite.after(async () => {
    if (server) {
      server.close();
    }
    await db.end();
  });

  // =========================================================================
  // SEC-01: CORS Verification
  // =========================================================================
  await suite.test('SEC-01 CORS: Whitelisted Origin receives Access-Control-Allow-Origin & credentials', async () => {
    const res = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'http://localhost' }
    });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), 'http://localhost');
    assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');
  });

  await suite.test('SEC-01 CORS: Whitelisted port Origin receives Access-Control-Allow-Origin', async () => {
    const res = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'http://127.0.0.1:3000' }
    });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), 'http://127.0.0.1:3000');
    assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');
  });

  await suite.test('SEC-01 CORS: Untrusted Origin receives NO Access-Control-Allow-Origin', async () => {
    const res = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'https://malicious-attacker.com' }
    });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  });

  await suite.test('SEC-01 CORS: Non-browser request with no Origin header succeeds with 200 OK', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, 'healthy');
  });

  await suite.test('SEC-01 CORS: Preflight OPTIONS on allowed origin returns allowed methods and headers', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization'
      }
    });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), 'http://localhost');
    assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');
    assert.ok(res.headers.get('access-control-allow-methods').includes('POST'));
  });

  await suite.test('SEC-01 CORS: Preflight OPTIONS on untrusted origin withholds access', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil-hacker.net',
        'Access-Control-Request-Method': 'POST'
      }
    });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  });

  // =========================================================================
  // BUS-01: Password Policy Unification Verification
  // =========================================================================
  await suite.test('BUS-01 Password: Register rejects password under 8 characters', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'test_user_short',
        email: 'test_short@quizsystem.local',
        password: 'pass12', // 6 chars
        fullName: 'Test Short',
        role: 'student'
      })
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /8 characters/i);
  });

  await suite.test('BUS-01 Password: Reset password rejects newPassword under 8 characters', async () => {
    const res = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'fake_token_hash_for_test',
        newPassword: 'pass123' // 7 chars
      })
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /8 characters/i);
  });

  await suite.test('BUS-01 Password: Change password rejects 6 and 7 char passwords with unified 8-char rule', async () => {
    // Generate an active test session for student1
    const user = await userRepo.findByUsername('student1');
    assert.ok(user, 'student1 must exist in database');

    const rawToken = generateSessionToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await sessionRepo.createSession(user.id, tokenHash, expiresAt, '127.0.0.1', 'Batch01Test');

    try {
      // 1. Try 6 chars
      const res6 = await fetch(`${baseUrl}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${rawToken}`
        },
        body: JSON.stringify({
          currentPassword: 'Password123!',
          newPassword: '123456' // 6 chars
        })
      });
      assert.strictEqual(res6.status, 400);
      const body6 = await res6.json();
      assert.strictEqual(body6.error, 'Mật khẩu mới phải có ít nhất 8 ký tự');

      // 2. Try 7 chars
      const res7 = await fetch(`${baseUrl}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${rawToken}`
        },
        body: JSON.stringify({
          currentPassword: 'Password123!',
          newPassword: '1234567' // 7 chars
        })
      });
      assert.strictEqual(res7.status, 400);
      const body7 = await res7.json();
      assert.strictEqual(body7.error, 'Mật khẩu mới phải có ít nhất 8 ký tự');

      // 3. Try wrong old password with valid 8-char new password
      const resWrongOld = await fetch(`${baseUrl}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${rawToken}`
        },
        body: JSON.stringify({
          currentPassword: 'WrongPassword999!',
          newPassword: 'NewValidPassword123!'
        })
      });
      assert.strictEqual(resWrongOld.status, 400);
      const bodyWrongOld = await resWrongOld.json();
      assert.strictEqual(bodyWrongOld.error, 'Mật khẩu hiện tại không chính xác');
    } finally {
      await sessionRepo.deleteByTokenHash(tokenHash);
    }
  });

  // =========================================================================
  // SEC-02: Rate Limiting Verification
  // =========================================================================
  await suite.test('SEC-02 Rate Limit: Failed login attempts trigger HTTP 429 when threshold exceeded', async () => {
    // Send 11 failed login requests from an isolated mock test IP via X-Forwarded-For
    const testIp = '198.51.100.99';
    let triggered429 = false;
    let lastStatus = 200;
    let rateLimitBody = null;

    for (let i = 0; i < 12; i++) {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': testIp
        },
        body: JSON.stringify({
          username: 'nonexistent_test_user_rate_limit',
          password: 'WrongPassword123!'
        })
      });
      lastStatus = res.status;
      if (res.status === 429) {
        triggered429 = true;
        rateLimitBody = await res.json();
        break;
      }
    }

    assert.ok(triggered429, `Expected rate limiter to return 429, but lastStatus was ${lastStatus}`);
    assert.strictEqual(rateLimitBody.code, 'RATE_LIMIT_EXCEEDED');
    assert.ok(rateLimitBody.error.includes('15 phút'));
  });

  await suite.test('SEC-02 Rate Limit: Non-auth routes (/health, /metrics) are NOT rate limited', async () => {
    const testIp = '198.51.100.99';
    const res = await fetch(`${baseUrl}/health`, {
      headers: { 'X-Forwarded-For': testIp }
    });
    assert.strictEqual(res.status, 200);
  });

  // =========================================================================
  // INF-01: Configuration & Secrets Hardening Verification
  // =========================================================================
  await suite.test('INF-01 Config: .env.example exists and contains no production credentials', async () => {
    const examplePath = path.join(__dirname, '../../.env.example');
    assert.ok(fs.existsSync(examplePath), '.env.example must exist in root');
    const content = fs.readFileSync(examplePath, 'utf8');
    assert.ok(content.includes('your_secure_mysql_user_password_here'));
    assert.ok(!content.includes('QuizPass123!'), '.env.example must not contain live password');
    assert.ok(!content.includes('RootPassword123!'), '.env.example must not contain live root password');
  });

  await suite.test('INF-01 Config: .gitignore properly excludes .env files and preserves .env.example', async () => {
    const gitignorePath = path.join(__dirname, '../../.gitignore');
    const content = fs.readFileSync(gitignorePath, 'utf8');
    assert.ok(content.includes('.env'));
    assert.ok(content.includes('!.env.example'));
  });

  await suite.test('INF-01 Config: db.js does not contain hardcoded fallback password', async () => {
    const dbConfigPath = path.join(__dirname, '../src/config/db.js');
    const content = fs.readFileSync(dbConfigPath, 'utf8');
    assert.ok(!content.includes("'QuizPass123!'"), 'db.js must not contain hardcoded password');
  });
});
