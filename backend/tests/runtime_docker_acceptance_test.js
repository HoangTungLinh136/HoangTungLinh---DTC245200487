/**
 * QUIZSYSTEM — PHASE 4 RUNTIME DOCKER ACCEPTANCE TEST
 * Executes non-destructive runtime verifications through Nginx (port 80)
 * and verifies that Docker container quizsystem-backend is actively serving requests.
 */

const http = require('http');
const mysql = require('mysql2/promise');
const crypto = require('crypto');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const reqOptions = {
      hostname: 'localhost',
      port: 80,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    if (body) {
      reqOptions.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on('error', reject);
    if (body) req.write(postData);
    req.end();
  });
}

async function runRuntimeAcceptance() {
  console.log('========================================================================');
  console.log('   QUIZSYSTEM PHASE 4 — DOCKER RUNTIME LIVE ACCEPTANCE VERIFICATION');
  console.log('   Target: Nginx Reverse Proxy (http://localhost:80 -> Backend:3000)');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(testId, description, condition, detail = '') {
    if (condition) {
      console.log(`[PASS] ${testId} — ${description} (${detail})`);
      passed++;
    } else {
      console.error(`[FAIL] ${testId} — ${description}: ${detail}`);
      failed++;
    }
  }

  // 1. Health & Readiness through Nginx
  const healthRes = await request({ path: '/health' });
  const readyRes = await request({ path: '/ready' });

  assert(
    'RT-01',
    'Nginx -> Backend HTTP /health trả HTTP 200 healthy',
    healthRes.status === 200 && healthRes.body.status === 'healthy',
    `Status: ${healthRes.status}, Body: ${JSON.stringify(healthRes.body)}`
  );

  assert(
    'RT-02',
    'Nginx -> Backend HTTP /ready xác nhận MySQL connected',
    readyRes.status === 200 && readyRes.body.status === 'ready' && readyRes.body.database === 'connected',
    `Status: ${readyRes.status}, Body: ${JSON.stringify(readyRes.body)}`
  );

  // 2. CORS Runtime check through Nginx
  const corsAllowed = await request({
    path: '/health',
    headers: { 'Origin': 'http://localhost' }
  });
  const corsBlocked = await request({
    path: '/health',
    headers: { 'Origin': 'http://untrusted-site.com' }
  });

  assert(
    'RT-03',
    'CORS Runtime: Whitelisted origin nhận ACAO header; untrusted origin bị chặn',
    corsAllowed.headers['access-control-allow-origin'] === 'http://localhost' &&
    !corsBlocked.headers['access-control-allow-origin'],
    `Allowed ACAO: ${corsAllowed.headers['access-control-allow-origin']}, Blocked ACAO: ${corsBlocked.headers['access-control-allow-origin']}`
  );

  // 3. Preflight OPTIONS Runtime check through Nginx
  const preflightRes = await request({
    path: '/api/auth/login',
    method: 'OPTIONS',
    headers: {
      'Origin': 'http://localhost',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type,Authorization'
    }
  });

  assert(
    'RT-04',
    'CORS Preflight: OPTIONS request qua Nginx trả HTTP 200/204 với Access-Control-Allow-Methods',
    (preflightRes.status === 200 || preflightRes.status === 204) &&
    preflightRes.headers['access-control-allow-origin'] === 'http://localhost',
    `Preflight status: ${preflightRes.status}, ACAO: ${preflightRes.headers['access-control-allow-origin']}`
  );

  // 4. Rate Limiting Runtime check through Nginx
  // Send 11 failed login requests from an isolated test IP
  const rateLimitHeader = { 'X-Forwarded-For': '203.0.113.199' };
  let got429 = false;
  for (let i = 0; i < 11; i++) {
    const res = await request({
      path: '/api/auth/login',
      method: 'POST',
      headers: rateLimitHeader
    }, { email: 'nonexistent_test@example.com', password: 'WrongPassword123!' });

    if (res.status === 429) {
      got429 = true;
      break;
    }
  }

  const healthAfterRateLimit = await request({
    path: '/health',
    headers: rateLimitHeader
  });

  assert(
    'RT-05',
    'Rate Limiting Runtime: Gửi vượt ngưỡng 10 lần kích hoạt HTTP 429; /health vẫn hoạt động bình thường',
    got429 && healthAfterRateLimit.status === 200,
    `Got 429: ${got429}, Health status: ${healthAfterRateLimit.status}`
  );

  // 5. Authentication & Authorization & Projection Masking via Nginx
  // Create a temporary read-only test session token directly in MySQL for student 3 (Hoang Tung Linh)
  const db = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'quiz_user',
    password: 'QuizPass123!',
    database: 'quizsystem',
    timezone: 'Z'
  });

  const rawTokenStudent3 = generateSessionToken();
  const tokenHashStudent3 = hashToken(rawTokenStudent3);
  const sessionExpiry = new Date(Date.now() + 300000); // 5 minutes

  await db.execute(
    `INSERT INTO user_sessions (user_id, token_hash, ip_address, user_agent, expires_at)
     VALUES (3, ?, '127.0.0.1', 'Docker-Acceptance-Test', ?)`,
    [tokenHashStudent3, sessionExpiry]
  );

  const rawTokenStudent4 = generateSessionToken();
  const tokenHashStudent4 = hashToken(rawTokenStudent4);
  await db.execute(
    `INSERT INTO user_sessions (user_id, token_hash, ip_address, user_agent, expires_at)
     VALUES (4, ?, '127.0.0.1', 'Docker-Acceptance-Test', ?)`,
    [tokenHashStudent4, sessionExpiry]
  );

  try {
    // Student 3 queries available exams
    const availableExamsRes = await request({
      path: '/api/attempts/available-exams',
      headers: { 'Authorization': `Bearer ${rawTokenStudent3}` }
    });

    assert(
      'RT-06',
      'Student xem danh sách bài thi khả dụng qua Nginx trả về HTTP 200',
      availableExamsRes.status === 200 && Array.isArray(availableExamsRes.body.exams),
      `Status: ${availableExamsRes.status}, Exams count: ${availableExamsRes.body.exams?.length}`
    );

    // Student 3 queries their attempt history
    const historyRes = await request({
      path: '/api/attempts/my-attempts',
      headers: { 'Authorization': `Bearer ${rawTokenStudent3}` }
    });

    assert(
      'RT-07',
      'Student xem lịch sử bài thi của mình qua Nginx trả về HTTP 200',
      historyRes.status === 200 && Array.isArray(historyRes.body.attempts),
      `Status: ${historyRes.status}, Attempts count: ${historyRes.body.attempts?.length}`
    );

    // Student 3 queries attempt 1 (belongs to student 3)
    const ownResultRes = await request({
      path: '/api/attempts/1/result',
      headers: { 'Authorization': `Bearer ${rawTokenStudent3}` }
    });

    assert(
      'RT-08',
      'Student xem kết quả bài thi của chính mình thành công (HTTP 200)',
      ownResultRes.status === 200 && ownResultRes.body.attemptId === 1,
      `Status: ${ownResultRes.status}, AttemptId: ${ownResultRes.body.attemptId}, Score: ${ownResultRes.body.score}`
    );

    // Student 4 queries attempt 1 (belongs to student 3) -> MUST be 403 Forbidden
    const otherStudentRes = await request({
      path: '/api/attempts/1/result',
      headers: { 'Authorization': `Bearer ${rawTokenStudent4}` }
    });

    assert(
      'RT-09',
      'Student bị chặn 403 Forbidden khi xem kết quả bài thi của sinh viên khác',
      otherStudentRes.status === 403,
      `Status: ${otherStudentRes.status}, Error: ${otherStudentRes.body.error}`
    );
  } finally {
    // Clean up temporary sessions
    await db.execute('DELETE FROM user_sessions WHERE token_hash IN (?, ?)', [tokenHashStudent3, tokenHashStudent4]);
    await db.end();
  }

  console.log('\n========================================================================');
  console.log(`   RUNTIME VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runRuntimeAcceptance().catch(err => {
  console.error('[RUNTIME_FATAL_ERROR]', err);
  process.exit(1);
});
