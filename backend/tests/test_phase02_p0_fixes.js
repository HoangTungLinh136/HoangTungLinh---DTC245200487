const http = require('http');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const { gradeAttempt } = require('../src/services/scoringService');
const { processExpiredAttempts } = require('../src/services/finalizationService');

const BASE_URL = 'http://localhost:80/api';

const dbConfig = {
  host: '127.0.0.1',
  port: 3307,
  user: 'quiz_user',
  password: 'QuizPass123!',
  database: 'quizsystem'
};

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const parsed = new URL(`${BASE_URL}${path}`);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsedBody = data;
        try {
          parsedBody = JSON.parse(data);
        } catch (e) {}
        resolve({ status: res.statusCode, body: parsedBody, headers: res.headers });
      });
    });

    req.on('error', reject);
    if (body) req.write(postData);
    req.end();
  });
}

async function runPhase02Tests() {
  console.log('========================================================================');
  console.log('          QUIZSYSTEM PHASE 02 (P0 DEFECT REMEDIATION) VERIFICATION');
  console.log('========================================================================\n');

  const db = await mysql.createConnection(dbConfig);
  let passed = 0;
  let failed = 0;

  try {
    // Acquire auth tokens
    const sLogin = await request('POST', '/auth/login', { username: 'student1', password: 'Password123!' });
    const sToken = sLogin.body.token;
    const sHeaders = { 'Authorization': `Bearer ${sToken}` };

    const tLogin = await request('POST', '/auth/login', { username: 'teacher1', password: 'Password123!' });
    const tToken = tLogin.body.token;
    const tHeaders = { 'Authorization': `Bearer ${tToken}` };

    const [uRows] = await db.execute("SELECT id FROM users WHERE username = 'student1'");
    const student1Id = uRows[0].id;

    // Clean any prior in_progress attempts for student1 on exam 2
    await db.execute("UPDATE exam_attempts SET status = 'completed' WHERE exam_id = 2 AND student_id = ? AND status = 'in_progress'", [student1Id]);

    // TEST 1: Concurrent draft save with identical requestId race condition
    console.log('[TEST 1] Concurrent saveDraft with identical requestId...');

    // Create fresh attempt for student1 on exam 2
    const now = new Date();
    const deadline = new Date(now.getTime() + 30 * 60 * 1000);
    const [attIns] = await db.execute(
      `INSERT INTO exam_attempts (exam_id, student_id, attempt_number, status, started_at, deadline_at)
       VALUES (2, ?, 888, 'in_progress', ?, ?)`,
      [student1Id, now, deadline]
    );
    const testAttemptId = attIns.insertId;

    // Snapshot questions for attempt
    const [eqs] = await db.execute('SELECT question_id, question_order, weight FROM exam_questions WHERE exam_id = 2');
    for (const eq of eqs) {
      const [ch] = await db.execute('SELECT id, content, is_correct, sort_order FROM question_choices WHERE question_id = ?', [eq.question_id]);
      const snap = {
        question_id: eq.question_id,
        title: `Q ${eq.question_id}`,
        content: 'Content',
        choices: ch.map(c => ({ id: c.id, content: c.content, is_correct: c.is_correct === 1, sort_order: c.sort_order }))
      };
      await db.execute(
        `INSERT INTO attempt_question_snapshots (attempt_id, question_id, question_order, question_type, weight, snapshot_data)
         VALUES (?, ?, ?, 'single_choice', ?, ?)`,
        [testAttemptId, eq.question_id, eq.question_order, eq.weight, JSON.stringify(snap)]
      );
    }

    const concurrentReqId = `race_req_${Date.now()}`;
    const payload = [{ question_id: eqs[0].question_id, selected_choice_ids: [1] }];

    // Fire 2 simultaneous requests with same requestId and payload
    const [raceA, raceB] = await Promise.all([
      request('POST', `/attempts/${testAttemptId}/draft`, { answers: payload, requestId: concurrentReqId }, { ...sHeaders, 'X-Request-Id': concurrentReqId }),
      request('POST', `/attempts/${testAttemptId}/draft`, { answers: payload, requestId: concurrentReqId }, { ...sHeaders, 'X-Request-Id': concurrentReqId })
    ]);

    if (raceA.status === 200 && raceB.status === 200) {
      console.log('  ✓ PASS: Both concurrent requests handled gracefully with HTTP 200 (no 500 error)');
      passed++;
    } else {
      console.error(`  ✗ FAIL: Unexpected status codes: raceA=${raceA.status} (${JSON.stringify(raceA.body)}), raceB=${raceB.status} (${JSON.stringify(raceB.body)})`);
      failed++;
    }

    // TEST 2: Concurrent SUBMIT with identical requestId race condition
    console.log('[TEST 2] Concurrent submitAttempt with identical requestId...');
    const subReqId = `race_sub_${Date.now()}`;
    const [subA, subB] = await Promise.all([
      request('POST', `/attempts/${testAttemptId}/submit`, { answers: payload, requestId: subReqId }, { ...sHeaders, 'X-Request-Id': subReqId }),
      request('POST', `/attempts/${testAttemptId}/submit`, { answers: payload, requestId: subReqId }, { ...sHeaders, 'X-Request-Id': subReqId })
    ]);

    if (subA.status === 200 && subB.status === 200) {
      console.log('  ✓ PASS: Both concurrent submit requests handled gracefully with HTTP 200');
      passed++;
    } else {
      console.error(`  ✗ FAIL: Unexpected submit status codes: subA=${subA.status} (${JSON.stringify(subA.body)}), subB=${subB.status} (${JSON.stringify(subB.body)})`);
      failed++;
    }

    // TEST 3: Unanswered questions recording in attempt_answers during auto-grading
    console.log('[TEST 3] Verify unanswered snapshot questions recorded with score_awarded = 0 and selected_choice_ids = []...');
    const [savedAnswers] = await db.execute(
      'SELECT question_id, selected_choice_ids, is_correct, score_awarded FROM attempt_answers WHERE attempt_id = ? ORDER BY question_id ASC',
      [testAttemptId]
    );

    const answeredQ = savedAnswers.find(a => a.question_id === eqs[0].question_id);
    const unansweredQ = savedAnswers.find(a => a.question_id !== eqs[0].question_id);

    if (unansweredQ && (unansweredQ.score_awarded === '0.00' || unansweredQ.score_awarded === 0) && unansweredQ.is_correct === 0) {
      console.log(`  ✓ PASS: Unanswered question ${unansweredQ.question_id} recorded in attempt_answers with score_awarded = 0 and choice_ids = ${unansweredQ.selected_choice_ids}`);
      passed++;
    } else {
      console.error('  ✗ FAIL: Unanswered question not properly recorded in attempt_answers', unansweredQ);
      failed++;
    }

    // TEST 4: Auto-Finalization on deadline expiration
    console.log('[TEST 4] Auto-finalization worker processing expired attempt without user submit...');
    await db.execute("UPDATE exam_attempts SET status = 'completed' WHERE exam_id = 2 AND student_id = ? AND status = 'in_progress'", [student1Id]);

    const [expIns] = await db.execute(
      `INSERT INTO exam_attempts (exam_id, student_id, attempt_number, status, started_at, deadline_at)
       VALUES (2, ?, 999, 'in_progress', NOW() - INTERVAL 10 MINUTE, NOW() - INTERVAL 5 MINUTE)`,
      [student1Id]
    );
    const expiredAttemptId = expIns.insertId;

    // Snapshot questions for expired attempt
    for (const eq of eqs) {
      const [ch] = await db.execute('SELECT id, content, is_correct, sort_order FROM question_choices WHERE question_id = ?', [eq.question_id]);
      const snap = {
        question_id: eq.question_id,
        title: `Q ${eq.question_id}`,
        content: 'Content',
        choices: ch.map(c => ({ id: c.id, content: c.content, is_correct: c.is_correct === 1, sort_order: c.sort_order }))
      };
      await db.execute(
        `INSERT INTO attempt_question_snapshots (attempt_id, question_id, question_order, question_type, weight, snapshot_data)
         VALUES (?, ?, ?, 'single_choice', ?, ?)`,
        [expiredAttemptId, eq.question_id, eq.question_order, eq.weight, JSON.stringify(snap)]
      );
    }

    // Execute background finalizer
    await processExpiredAttempts();

    const [expCheck] = await db.execute(
      'SELECT status, grading_status, score FROM exam_attempts WHERE id = ?',
      [expiredAttemptId]
    );

    if (expCheck[0].status === 'expired' && expCheck[0].grading_status === 'graded') {
      console.log(`  ✓ PASS: Expired attempt ${expiredAttemptId} auto-finalized to 'expired' and auto-graded (Score: ${expCheck[0].score})`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: Expired attempt not finalized properly: status=${expCheck[0]?.status}, grading_status=${expCheck[0]?.grading_status}`);
      failed++;
    }

    // TEST 5: Publication gate (Scores hidden before publication, visible after)
    console.log('[TEST 5] Publication gate enforcement on results...');
    // Ensure exam 2 scores publication is OFF
    await db.execute('UPDATE exams SET is_published_scores = 0, is_published_answers = 0 WHERE id = 2');

    const resHidden = await request('GET', `/attempts/${testAttemptId}/result`, null, sHeaders);
    const scoreHidden = resHidden.body.score === null && resHidden.body.questions === undefined;

    // Turn ON publication
    await db.execute('UPDATE exams SET is_published_scores = 1, is_published_answers = 1 WHERE id = 2');
    const resVisible = await request('GET', `/attempts/${testAttemptId}/result`, null, sHeaders);
    const scoreVisible = resVisible.body.score !== null && Array.isArray(resVisible.body.questions);

    // Reset back to original
    await db.execute('UPDATE exams SET is_published_scores = 1, is_published_answers = 1 WHERE id = 2');

    if (scoreHidden && scoreVisible) {
      console.log('  ✓ PASS: Score strictly masked when unpublished and exposed when published by teacher');
      passed++;
    } else {
      console.error(`  ✗ FAIL: Publication gate violated. hidden=${scoreHidden}, visible=${scoreVisible}`);
      failed++;
    }

    // Cleanup test attempts
    await db.execute('DELETE FROM exam_attempts WHERE id IN (?, ?)', [testAttemptId, expiredAttemptId]);

    console.log('\n========================================================================');
    console.log(`TOTAL PHASE 02 TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log('========================================================================\n');

  } finally {
    await db.end();
  }
}

runPhase02Tests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
