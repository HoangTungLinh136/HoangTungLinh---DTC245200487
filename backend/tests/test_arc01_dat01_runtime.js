/**
 * QUIZSYSTEM — ARC-01 & DAT-01 AUTOMATED RUNTIME ACCEPTANCE SUITE
 * 
 * Verifies all 13 mandatory test scenarios in isolated database (quizsystem_test):
 * - TC-DAT-01: Save & Submit committed before HTTP ACK
 * - TC-DAT-02: Idempotent replay on lost ACK
 * - TC-DAT-03: Conflicting payload on duplicate request_id
 * - TC-ARC-01: SAVE / SUBMIT concurrency and ordering
 * - TC-ARC-02: Sub-second submission right before deadline
 * - TC-ARC-03: Worker crash and stale lease recovery
 * - TC-ARC-04: FIFO Queue error isolation and queue cleanup
 * - TC-ARC-05: Late request received after deadline rejected / expired
 * - TC-DAT-04: Rollback on grading failure (no partial scores)
 * - TC-DAT-05: Fencing token blocks zombie workers
 * - TC-DAT-06: Repeated grading idempotent
 * - TC-DAT-07: Snapshot immutability when Question Bank updated
 * - TC-DAT-08: Score & Answer projection masking until published
 */

process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'quizsystem_test';
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.DB_PORT || '3307';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'QuizPass123!';

const http = require('http');
const mysql = require('mysql2/promise');
const app = require('../src/server');
const db = require('../src/config/db');
const attemptController = require('../src/controllers/attemptController');
const { gradeAttempt, claimGradingJob, completeGradingJob, calculateNormalizedScore } = require('../src/services/scoringService');
const { processExpiredAttempts, processStaleGradingRecovery } = require('../src/services/finalizationService');
const { generateSessionToken, hashToken } = require('../src/middleware/auth');

let server;
let baseUrl;
let rawDb;

async function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const parsed = new URL(`${baseUrl}${path}`);
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

async function setupIsolatedFixtures() {
  rawDb = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: 'quiz_user',
    password: process.env.DB_PASSWORD,
    database: 'quizsystem_test',
    timezone: 'Z'
  });

  // Clean test tables
  await rawDb.execute('SET FOREIGN_KEY_CHECKS = 0');
  await rawDb.execute('TRUNCATE TABLE attempt_receipts');
  await rawDb.execute('TRUNCATE TABLE attempt_answers');
  await rawDb.execute('TRUNCATE TABLE attempt_question_snapshots');
  await rawDb.execute('TRUNCATE TABLE exam_attempts');
  await rawDb.execute('TRUNCATE TABLE exam_questions');
  await rawDb.execute('TRUNCATE TABLE exam_assignments');
  await rawDb.execute('TRUNCATE TABLE exams');
  await rawDb.execute('TRUNCATE TABLE question_choices');
  await rawDb.execute('TRUNCATE TABLE questions');
  await rawDb.execute('TRUNCATE TABLE user_sessions');
  await rawDb.execute('TRUNCATE TABLE users');
  await rawDb.execute('SET FOREIGN_KEY_CHECKS = 1');

  // Seed test users
  const dummyHash = '$2a$10$NRwu9TTN6P8ZQYbBKe0LEOG2LGvOOdmetWdlRMeACzLdcifEHO8GS'; // Hoanglinh1#
  await rawDb.execute(
    `INSERT INTO users (id, username, email, password_hash, full_name, role, status) VALUES
     (101, 'test_teacher', 'teacher@test.com', ?, 'Test Teacher', 'teacher', 'active'),
     (102, 'test_student', 'student@test.com', ?, 'Test Student', 'student', 'active'),
     (103, 'test_student2', 'student2@test.com', ?, 'Test Student 2', 'student', 'active')`,
    [dummyHash, dummyHash, dummyHash]
  );

  // Seed question bank (1 single choice, 1 multiple choice)
  await rawDb.execute(
    `INSERT INTO questions (id, created_by, title, content, question_type, subject, difficulty, status) VALUES
     (501, 101, 'Q1 Single', 'What is 2+2?', 'single_choice', 'Math', 'easy', 'active'),
     (502, 101, 'Q2 Multi', 'Select prime numbers', 'multiple_choice', 'Math', 'medium', 'active')`
  );

  await rawDb.execute(
    `INSERT INTO question_choices (id, question_id, content, is_correct, sort_order) VALUES
     (601, 501, '4', 1, 1),
     (602, 501, '5', 0, 2),
     (603, 502, '2', 1, 1),
     (604, 502, '3', 1, 2),
     (605, 502, '4', 0, 3)`
  );

  // Seed public exam
  await rawDb.execute(
    `INSERT INTO exams (id, created_by, title, duration_minutes, max_attempts, pass_score, access_type, status, is_published_scores, is_published_answers) VALUES
     (701, 101, 'Calculus & Primes Exam', 30, 10, 5.00, 'public', 'published', 0, 0)`
  );

  await rawDb.execute(
    `INSERT INTO exam_questions (id, exam_id, question_id, question_order, weight) VALUES
     (801, 701, 501, 1, 5.00),
     (802, 701, 502, 2, 5.00)`
  );
}

async function createAuthHeaders(userId) {
  const rawToken = generateSessionToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
  await rawDb.execute(
    'INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [userId, tokenHash, expiresAt]
  );
  return { 'Authorization': `Bearer ${rawToken}` };
}

async function runSuite() {
  console.log('========================================================================');
  console.log('   QUIZSYSTEM ARC-01 & DAT-01 AUTOMATED RUNTIME ACCEPTANCE SUITE');
  console.log('   Isolated Test DB: quizsystem_test (Preserves Production DB 100%)');
  console.log('========================================================================\n');

  await setupIsolatedFixtures();

  // Start ephemeral Express test server
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  const studentHeaders = await createAuthHeaders(102);
  const teacherHeaders = await createAuthHeaders(101);

  let passed = 0;
  let failed = 0;

  function assert(testId, name, condition, details = '') {
    if (condition) {
      passed++;
      console.log(`[PASS] ${testId} — ${name} ${details ? '(' + details + ')' : ''}`);
    } else {
      failed++;
      console.error(`[FAIL] ${testId} — ${name}: ${details}`);
    }
  }

  try {
    // -------------------------------------------------------------------------
    // TC-DAT-01: Lưu nháp và nộp bài được commit trước HTTP ACK
    // -------------------------------------------------------------------------
    const startRes1 = await request('POST', '/api/attempts/start', { examId: 701 }, studentHeaders);
    const attemptId1 = startRes1.body.attemptId;

    const draftRes1 = await request('POST', `/api/attempts/${attemptId1}/draft`, {
      answers: [{ question_id: 501, selected_choice_ids: [601] }]
    }, { ...studentHeaders, 'x-request-id': 'req-dat-01-save' });

    // Verify immediately in MySQL on a separate connection
    const [savedAnswers1] = await rawDb.execute(
      'SELECT selected_choice_ids FROM attempt_answers WHERE attempt_id = ? AND question_id = 501',
      [attemptId1]
    );
    const [savedReceipt1] = await rawDb.execute(
      'SELECT outcome_status FROM attempt_receipts WHERE attempt_id = ? AND request_id = ?',
      [attemptId1, 'req-dat-01-save']
    );

    const submitRes1 = await request('POST', `/api/attempts/${attemptId1}/submit`, {}, {
      ...studentHeaders,
      'x-request-id': 'req-dat-01-submit'
    });

    const [savedAttempt1] = await rawDb.execute(
      'SELECT status FROM exam_attempts WHERE id = ?',
      [attemptId1]
    );

    assert(
      'TC-DAT-01',
      'Lưu nháp và nộp bài được commit trước HTTP ACK',
      draftRes1.status === 200 &&
      savedAnswers1.length > 0 &&
      savedReceipt1[0]?.outcome_status === 'COMMITTED' &&
      submitRes1.status === 200 &&
      savedAttempt1[0]?.status === 'completed',
      `status: ${savedAttempt1[0]?.status}`
    );

    // -------------------------------------------------------------------------
    // TC-DAT-02: Gửi lại request khi mất ACK (Idempotency)
    // -------------------------------------------------------------------------
    const startRes2 = await request('POST', '/api/attempts/start', { examId: 701 }, studentHeaders);
    // Note: student already took exam 701 (max_attempts = 10), so start new attempt
    const attemptId2 = startRes2.body.attemptId;

    const reqId2 = 'req-idemp-replay-02';
    const draftPayload2 = { answers: [{ question_id: 501, selected_choice_ids: [601] }] };

    const firstAck = await request('POST', `/api/attempts/${attemptId2}/draft`, draftPayload2, {
      ...studentHeaders,
      'x-request-id': reqId2
    });

    const secondAck = await request('POST', `/api/attempts/${attemptId2}/draft`, draftPayload2, {
      ...studentHeaders,
      'x-request-id': reqId2
    });

    const [receiptCount2] = await rawDb.execute(
      'SELECT COUNT(*) AS total FROM attempt_receipts WHERE attempt_id = ? AND request_id = ?',
      [attemptId2, reqId2]
    );

    assert(
      'TC-DAT-02',
      'Gửi lại request khi mất ACK trả về kết quả đã cache và không sinh bản ghi trùng',
      firstAck.status === 200 &&
      secondAck.status === 200 &&
      firstAck.body.savedCount === secondAck.body.savedCount &&
      receiptCount2[0].total === 1,
      `Receipts count: ${receiptCount2[0].total}`
    );

    // -------------------------------------------------------------------------
    // TC-DAT-03: Trùng request ID nhưng payload khác -> HTTP 409 Conflict
    // -------------------------------------------------------------------------
    const conflictRes = await request('POST', `/api/attempts/${attemptId2}/draft`, {
      answers: [{ question_id: 501, selected_choice_ids: [602] }] // Changed to choice 602
    }, {
      ...studentHeaders,
      'x-request-id': reqId2
    });

    assert(
      'TC-DAT-03',
      'Trùng request ID nhưng payload khác trả về HTTP 409 Conflict',
      conflictRes.status === 409 && conflictRes.body.error.includes('conflicting payload digest'),
      `Status: ${conflictRes.status}`
    );

    // -------------------------------------------------------------------------
    // TC-ARC-01: SAVE/SUBMIT tương tranh (SAVE luôn hoàn tất trước SUBMIT)
    // -------------------------------------------------------------------------
    const startRes3 = await request('POST', '/api/attempts/start', { examId: 701 }, studentHeaders);
    const attemptId3 = startRes3.body.attemptId;

    // Introduce simulated delay hook to SAVE to test Ingress FIFO Queue serialization
    let delayHookTriggered = false;
    attemptController._setTestConnectionDelayHook(async (attId) => {
      if (attId === attemptId3) {
        delayHookTriggered = true;
        await new Promise(r => setTimeout(r, 60)); // 60ms delay
      }
    });

    // Fire SAVE and immediate SUBMIT concurrently
    const pSave = request('POST', `/api/attempts/${attemptId3}/draft`, {
      answers: [{ question_id: 501, selected_choice_ids: [601] }, { question_id: 502, selected_choice_ids: [603, 604] }]
    }, studentHeaders);

    const pSubmit = request('POST', `/api/attempts/${attemptId3}/submit`, {}, studentHeaders);

    const [saveOutcome, submitOutcome] = await Promise.all([pSave, pSubmit]);
    attemptController._setTestConnectionDelayHook(null); // Reset hook

    // Query graded attempt score in MySQL
    const [attemptRecord3] = await rawDb.execute(
      'SELECT status, score FROM exam_attempts WHERE id = ?',
      [attemptId3]
    );

    assert(
      'TC-ARC-01',
      'SAVE/SUBMIT tương tranh: SAVE commit trước SUBMIT, tính điểm đúng 10/10',
      delayHookTriggered &&
      saveOutcome.status === 200 &&
      submitOutcome.status === 200 &&
      attemptRecord3[0]?.status === 'completed' &&
      Number(attemptRecord3[0]?.score) === 10.00,
      `Score: ${attemptRecord3[0]?.score}, delayHook: ${delayHookTriggered}`
    );

    // -------------------------------------------------------------------------
    // TC-ARC-02: Nộp bài sát deadline (Sub-second Race)
    // -------------------------------------------------------------------------
    // Create attempt with deadline expiring in 600ms
    const nearDeadline = new Date(Date.now() + 600);
    const [attInsert4] = await rawDb.execute(
      `INSERT INTO exam_attempts (exam_id, student_id, attempt_number, status, started_at, deadline_at)
       VALUES (701, 102, 4, 'in_progress', NOW(), ?)`,
      [nearDeadline]
    );
    const attemptId4 = attInsert4.insertId;

    // Copy snapshot for attempt 4
    await rawDb.execute(
      `INSERT INTO attempt_question_snapshots (attempt_id, question_id, question_order, question_type, weight, snapshot_data)
       SELECT ?, question_id, question_order, question_type, weight, snapshot_data
       FROM attempt_question_snapshots WHERE attempt_id = ?`,
      [attemptId4, attemptId1]
    );

    // Send submit while now < deadline (arrives before deadline)
    const subPromise4 = request('POST', `/api/attempts/${attemptId4}/submit`, {}, studentHeaders);

    // Concurrently trigger background processExpiredAttempts
    const finalizerPromise = processExpiredAttempts();

    const [subRes4] = await Promise.all([subPromise4, finalizerPromise]);

    const [attRec4] = await rawDb.execute(
      'SELECT status FROM exam_attempts WHERE id = ?',
      [attemptId4]
    );

    assert(
      'TC-ARC-02',
      'Nộp bài sát deadline: Ghi nhận completed, không bị finalizer chốt expired',
      subRes4.status === 200 && attRec4[0]?.status === 'completed',
      `Status: ${attRec4[0]?.status}`
    );

    // -------------------------------------------------------------------------
    // TC-ARC-03: Worker crash và recovery
    // -------------------------------------------------------------------------
    // Create attempt completed but stuck in 'grading' with expired lease
    const pastLease = new Date(Date.now() - 40000); // 40 seconds ago
    const [attInsert5] = await rawDb.execute(
      `INSERT INTO exam_attempts (exam_id, student_id, attempt_number, status, grading_status, grading_fencing_token, grading_lease_expires_at, started_at, deadline_at)
       VALUES (701, 102, 5, 'completed', 'grading', 1, ?, NOW(), NOW())`,
      [pastLease]
    );
    const attemptId5 = attInsert5.insertId;

    // Copy snapshot for attempt 5
    await rawDb.execute(
      `INSERT INTO attempt_question_snapshots (attempt_id, question_id, question_order, question_type, weight, snapshot_data)
       SELECT ?, question_id, question_order, question_type, weight, snapshot_data
       FROM attempt_question_snapshots WHERE attempt_id = ?`,
      [attemptId5, attemptId1]
    );

    // Save answer
    await rawDb.execute(
      `INSERT INTO attempt_answers (attempt_id, question_id, selected_choice_ids, revision)
       VALUES (?, 501, '[601]', 1), (?, 502, '[603, 604]', 1)`,
      [attemptId5, attemptId5]
    );

    // Trigger recovery
    await processStaleGradingRecovery();

    const [attRec5] = await rawDb.execute(
      'SELECT status, grading_status, score, grading_fencing_token FROM exam_attempts WHERE id = ?',
      [attemptId5]
    );

    assert(
      'TC-ARC-03',
      'Worker crash và recovery: Reclaim job thành công, chuyển sang graded',
      attRec5[0]?.grading_status === 'graded' &&
      Number(attRec5[0]?.score) === 10.00 &&
      attRec5[0]?.grading_fencing_token >= 2,
      `Grading status: ${attRec5[0]?.grading_status}, Fencing token: ${attRec5[0]?.grading_fencing_token}`
    );

    // -------------------------------------------------------------------------
    // TC-ARC-04: FIFO Queue không bị kẹt sau lỗi & Zero memory leak
    // -------------------------------------------------------------------------
    const testQueueId = 99999;
    let task1ErrorCaught = false;

    const task1 = attemptController.enqueueAttemptOperation(testQueueId, async () => {
      throw new Error('Simulated queue error in task 1');
    }).catch(err => {
      task1ErrorCaught = err.message.includes('Simulated queue error');
    });

    const task2 = attemptController.enqueueAttemptOperation(testQueueId, async () => {
      return 'task2_success';
    });

    const [_, task2Result] = await Promise.all([task1, task2]);
    await new Promise(r => setTimeout(r, 20));

    const queueMap = attemptController._getQueueMap();

    assert(
      'TC-ARC-04',
      'FIFO Queue không bị kẹt sau lỗi, task sau thực thi bình thường và giải phóng RAM',
      task1ErrorCaught &&
      task2Result === 'task2_success' &&
      !queueMap.has(testQueueId),
      `Task2: ${task2Result}, queue has id: ${queueMap.has(testQueueId)}`
    );

    // -------------------------------------------------------------------------
    // TC-ARC-05: Request đến sau deadline bị từ chối / chốt expired
    // -------------------------------------------------------------------------
    // Create attempt already past deadline
    const expiredDeadline = new Date(Date.now() - 5000); // 5 seconds ago
    const [attInsert6] = await rawDb.execute(
      `INSERT INTO exam_attempts (exam_id, student_id, attempt_number, status, started_at, deadline_at)
       VALUES (701, 102, 6, 'in_progress', NOW(), ?)`,
      [expiredDeadline]
    );
    const attemptId6 = attInsert6.insertId;

    // Save draft after deadline -> expect HTTP 400
    const lateSave = await request('POST', `/api/attempts/${attemptId6}/draft`, {
      answers: [{ question_id: 501, selected_choice_ids: [601] }]
    }, studentHeaders);

    // Submit after deadline -> expect status = expired
    const lateSubmit = await request('POST', `/api/attempts/${attemptId6}/submit`, {}, studentHeaders);

    const [attRec6] = await rawDb.execute(
      'SELECT status FROM exam_attempts WHERE id = ?',
      [attemptId6]
    );

    assert(
      'TC-ARC-05',
      'Request đến sau deadline: saveDraft bị từ chối (400), submit ghi nhận expired',
      lateSave.status === 400 &&
      lateSubmit.status === 200 &&
      attRec6[0]?.status === 'expired',
      `Late save: ${lateSave.status}, Submit status: ${attRec6[0]?.status}`
    );

    // -------------------------------------------------------------------------
    // TC-DAT-04: Rollback khi chấm điểm thất bại (Nguyên tử hóa Phase 2)
    // -------------------------------------------------------------------------
    const leaseFuture7 = new Date(Date.now() + 30000);
    const [attInsert7] = await rawDb.execute(
      `INSERT INTO exam_attempts (exam_id, student_id, attempt_number, status, grading_status, grading_fencing_token, grading_lease_expires_at, started_at, deadline_at)
       VALUES (701, 102, 7, 'completed', 'grading', 1, ?, NOW(), NOW())`,
      [leaseFuture7]
    );
    const attemptId7 = attInsert7.insertId;

    // Intentionally pass an invalid answer with question_id = null to violate NOT NULL constraint
    let rollbackDetected = false;
    try {
      await completeGradingJob(
        attemptId7,
        1,
        10.0,
        10.0,
        10.0,
        [{ question_id: null, choiceIdsJson: '[1]', isCorrect: 1, awardedScore: 5.0 }]
      );
    } catch (e) {
      rollbackDetected = true;
    }

    // Verify MySQL state remains unchanged
    const [attRec7] = await rawDb.execute(
      'SELECT grading_status, score FROM exam_attempts WHERE id = ?',
      [attemptId7]
    );
    const [ansRec7] = await rawDb.execute(
      'SELECT COUNT(*) AS c FROM attempt_answers WHERE attempt_id = ?',
      [attemptId7]
    );

    assert(
      'TC-DAT-04',
      'Rollback khi chấm điểm thất bại: Không ghi nhận điểm hay đáp án dở dang',
      rollbackDetected &&
      attRec7[0]?.grading_status === 'grading' &&
      attRec7[0]?.score === null &&
      ansRec7[0]?.c === 0,
      `Rollback caught: ${rollbackDetected}, Score: ${attRec7[0]?.score}`
    );

    // -------------------------------------------------------------------------
    // TC-DAT-05: Fencing token ngăn zombie worker
    // -------------------------------------------------------------------------
    // Attempt 8 in 'grading' with fencing_token = 2
    const leaseFuture8 = new Date(Date.now() + 30000);
    const [attInsert8] = await rawDb.execute(
      `INSERT INTO exam_attempts (exam_id, student_id, attempt_number, status, grading_status, grading_fencing_token, grading_lease_expires_at, started_at, deadline_at)
       VALUES (701, 102, 8, 'completed', 'grading', 2, ?, NOW(), NOW())`,
      [leaseFuture8]
    );
    const attemptId8 = attInsert8.insertId;

    // Zombie worker tries to complete with stale fencing_token = 1
    const staleCompletion = await completeGradingJob(attemptId8, 1, 10.0, 10.0, 10.0);

    // Valid worker completes with fencing_token = 2
    const validCompletion = await completeGradingJob(attemptId8, 2, 8.0, 10.0, 8.0);

    const [attRec8] = await rawDb.execute(
      'SELECT grading_status, score FROM exam_attempts WHERE id = ?',
      [attemptId8]
    );

    assert(
      'TC-DAT-05',
      'Fencing token ngăn zombie worker ghi đè điểm',
      staleCompletion.committed === false &&
      staleCompletion.reason === 'STALE_FENCING_TOKEN' &&
      validCompletion.committed === true &&
      Number(attRec8[0]?.score) === 8.00,
      `Stale reason: ${staleCompletion.reason}, Valid score: ${attRec8[0]?.score}`
    );

    // -------------------------------------------------------------------------
    // TC-DAT-06: Chấm điểm lặp không làm thay đổi kết quả (Idempotency)
    // -------------------------------------------------------------------------
    const repeatClaim = await claimGradingJob(attemptId8, 'second_worker');

    assert(
      'TC-DAT-06',
      'Chấm điểm lặp không làm thay đổi kết quả (Idempotent rejection)',
      repeatClaim.eligible === false && repeatClaim.reason === 'ALREADY_GRADED',
      `Reason: ${repeatClaim.reason}`
    );

    // -------------------------------------------------------------------------
    // TC-DAT-07: Snapshot bất biến khi Teacher sửa câu hỏi trong ngân hàng
    // -------------------------------------------------------------------------
    // Create new attempt
    const startRes9 = await request('POST', '/api/attempts/start', { examId: 701 }, studentHeaders);
    const attemptId9 = startRes9.body.attemptId;

    // Student selects choice 601 (which is currently correct '4')
    await request('POST', `/api/attempts/${attemptId9}/draft`, {
      answers: [{ question_id: 501, selected_choice_ids: [601] }]
    }, studentHeaders);

    // Teacher modifies question 501 in the bank: makes choice 602 correct instead of 601!
    await rawDb.execute('UPDATE question_choices SET is_correct = 0 WHERE id = 601');
    await rawDb.execute('UPDATE question_choices SET is_correct = 1 WHERE id = 602');

    // Student submits
    await request('POST', `/api/attempts/${attemptId9}/submit`, {}, studentHeaders);

    // Query graded attempt score
    const [attRec9] = await rawDb.execute(
      'SELECT raw_score FROM exam_attempts WHERE id = ?',
      [attemptId9]
    );

    // Reset choices back
    await rawDb.execute('UPDATE question_choices SET is_correct = 1 WHERE id = 601');
    await rawDb.execute('UPDATE question_choices SET is_correct = 0 WHERE id = 602');

    assert(
      'TC-DAT-07',
      'Snapshot bất biến: Chấm điểm theo snapshot gốc, không bị ảnh hưởng khi Teacher sửa câu hỏi',
      Number(attRec9[0]?.raw_score) >= 5.0,
      `Raw score: ${attRec9[0]?.raw_score}`
    );

    // -------------------------------------------------------------------------
    // TC-DAT-08: Không công bố điểm trước khi Teacher cho phép (Projection Masking)
    // -------------------------------------------------------------------------
    // Query result as student while is_published_scores = 0 and is_published_answers = 0
    const studentViewUnpublished = await request('GET', `/api/attempts/${attemptId9}/result`, null, studentHeaders);

    // Teacher publishes scores
    await rawDb.execute('UPDATE exams SET is_published_scores = 1 WHERE id = 701');
    const studentViewPublished = await request('GET', `/api/attempts/${attemptId9}/result`, null, studentHeaders);

    assert(
      'TC-DAT-08',
      'Không công bố điểm trước khi Teacher cho phép (Projection Masking)',
      studentViewUnpublished.body.score === null &&
      studentViewUnpublished.body.scoreMessage.includes('chưa được giáo viên công bố') &&
      studentViewPublished.body.score !== null,
      `Unpublished score: ${studentViewUnpublished.body.score}, Published score: ${studentViewPublished.body.score}`
    );

    // -------------------------------------------------------------------------
    // TC-ARC-06: ARC-R1 Serialization Safety on Queue Timeout
    // Tác vụ A vượt timeout 50ms nhưng tiếp tục chạy; Tác vụ B BẮT BUỘC PHẢI CHỜ
    // Tác vụ A kết thúc hoàn toàn (rollback xong) mới được thực thi.
    // -------------------------------------------------------------------------
    const testQueueAttemptId = 88881;
    let taskAFinishedAt = 0;
    let taskBStartedAt = 0;
    let taskARollbackOccurred = false;
    let taskATimeoutErrorCaught = false;

    // Task A: Runs long (150ms), timeout is set to 50ms
    const taskAPromise = attemptController.enqueueAttemptOperation(testQueueAttemptId, async (abortSignal) => {
      const connA = await rawDb.getConnection ? await rawDb.getConnection() : rawDb;
      // Start transaction or simulate MySQL write
      await rawDb.execute('SET @task_a_active = 1');
      
      // Wait past timeout (150ms > 50ms)
      await new Promise(r => setTimeout(r, 150));

      if (abortSignal && abortSignal.aborted) {
        taskARollbackOccurred = true;
        taskAFinishedAt = Date.now();
        throw new Error('Task A aborted due to timeout');
      }
      taskAFinishedAt = Date.now();
      return 'taskA_success';
    }, 50).catch(err => {
      if (err.message.includes('timed out')) {
        taskATimeoutErrorCaught = true;
      }
    });

    // Task B: Enqueued for the SAME attemptId immediately
    const taskBPromise = attemptController.enqueueAttemptOperation(testQueueAttemptId, async () => {
      taskBStartedAt = Date.now();
      return 'taskB_committed';
    });

    const [taskAResult, taskBResult] = await Promise.all([taskAPromise, taskBPromise]);

    assert(
      'TC-ARC-06',
      'ARC-R1 Tuần tự hóa an toàn khi Timeout: Task B chỉ chạy SAU KHI Task A hoàn tất rollback/thoát',
      taskATimeoutErrorCaught &&
      taskARollbackOccurred &&
      taskBResult === 'taskB_committed' &&
      taskBStartedAt >= taskAFinishedAt &&
      taskAFinishedAt > 0,
      `Task A timeout caught: ${taskATimeoutErrorCaught}, Task A aborted: ${taskARollbackOccurred}, TaskB start >= TaskA finish: ${taskBStartedAt >= taskAFinishedAt} (${taskBStartedAt} >= ${taskAFinishedAt})`
    );

    // -------------------------------------------------------------------------
    // TC-ARC-07: ARC-R2 Finalizer Race Reconcile
    // Request nộp bài đến trước deadline nhưng Finalizer đã chốt expired trước trong queue.
    // Hệ thống hòa giải (reconcile) thành công sang completed và chấm điểm chính xác.
    // -------------------------------------------------------------------------
    // Create attempt 10 with deadline in 800ms
    const reconcileDeadline = new Date(Date.now() + 800);
    const [attInsert10] = await rawDb.execute(
      `INSERT INTO exam_attempts (exam_id, student_id, attempt_number, status, started_at, deadline_at)
       VALUES (701, 102, 10, 'in_progress', NOW(), ?)`,
      [reconcileDeadline]
    );
    const attemptId10 = attInsert10.insertId;

    // Copy snapshot for attempt 10
    await rawDb.execute(
      `INSERT INTO attempt_question_snapshots (attempt_id, question_id, question_order, question_type, weight, snapshot_data)
       SELECT ?, question_id, question_order, question_type, weight, snapshot_data
       FROM attempt_question_snapshots WHERE attempt_id = ?`,
      [attemptId10, attemptId1]
    );

    // Setup hook: When submit request reaches controller, simulate Finalizer having updated status to 'expired'
    // in MySQL right before the submit transaction locks the attempt row!
    attemptController._setTestConnectionDelayHook(async (targetAttemptId) => {
      if (targetAttemptId === attemptId10) {
        await rawDb.execute("UPDATE exam_attempts SET status = 'expired' WHERE id = ?", [attemptId10]);
      }
    });

    // Send submit request (server arrival timestamp < deadline)
    const submitReconcileRes = await request('POST', `/api/attempts/${attemptId10}/submit`, {
      answers: [
        { question_id: 501, selected_choice_ids: [601] },
        { question_id: 502, selected_choice_ids: [603, 604] }
      ]
    }, studentHeaders);

    attemptController._setTestConnectionDelayHook(null); // Reset hook

    const [attRec10] = await rawDb.execute(
      'SELECT status, score, grading_status FROM exam_attempts WHERE id = ?',
      [attemptId10]
    );

    assert(
      'TC-ARC-07',
      'ARC-R2 Cạnh tranh Finalizer: Request đến trước deadline được hòa giải sang completed và chấm điểm đúng',
      submitReconcileRes.status === 200 &&
      submitReconcileRes.body.status === 'completed' &&
      submitReconcileRes.body.reconciled === true &&
      attRec10[0]?.status === 'completed' &&
      attRec10[0]?.grading_status === 'graded' &&
      Number(attRec10[0]?.score) === 10.00,
      `HTTP: ${submitReconcileRes.status}, Status: ${attRec10[0]?.status}, Score: ${attRec10[0]?.score}, Reconciled: ${submitReconcileRes.body.reconciled}`
    );

    // -------------------------------------------------------------------------
    // TC-ARC-08: ARC-R2 Late Submit Post-Deadline Rejection
    // Request nộp bài đến SAU deadline khi attempt đã expired -> kiên quyết từ chối HTTP 409
    // -------------------------------------------------------------------------
    const lateDeadline11 = new Date(Date.now() - 5000); // 5 seconds in the past
    const [attInsert11] = await rawDb.execute(
      `INSERT INTO exam_attempts (exam_id, student_id, attempt_number, status, started_at, deadline_at)
       VALUES (701, 102, 11, 'expired', NOW(), ?)`,
      [lateDeadline11]
    );
    const attemptId11 = attInsert11.insertId;

    // Send submit request after deadline
    const lateSubmitRes = await request('POST', `/api/attempts/${attemptId11}/submit`, {
      answers: [{ question_id: 501, selected_choice_ids: [601] }]
    }, studentHeaders);

    const [attRec11] = await rawDb.execute(
      'SELECT status FROM exam_attempts WHERE id = ?',
      [attemptId11]
    );

    assert(
      'TC-ARC-08',
      'ARC-R2 Nộp bài sau deadline: Kiên quyết từ chối HTTP 409, giữ nguyên status expired',
      lateSubmitRes.status === 409 &&
      lateSubmitRes.body.error.includes('deadline has passed') &&
      attRec11[0]?.status === 'expired',
      `HTTP status: ${lateSubmitRes.status}, DB status: ${attRec11[0]?.status}`
    );

    // -------------------------------------------------------------------------
    // TC-DAT-09: DAT-R1 Đồng bộ Timezone UTC & Fencing Lease MySQL
    // Xác minh timezone UTC trong MySQL & Node.js khớp hoàn toàn, không lệch múi giờ
    // -------------------------------------------------------------------------
    const [tzInsert] = await rawDb.execute(
      `INSERT INTO exam_attempts (exam_id, student_id, attempt_number, status, grading_status, grading_fencing_token,
                                  grading_lease_expires_at, started_at, deadline_at)
       VALUES (701, 102, 12, 'completed', 'grading', 1,
               TIMESTAMPADD(SECOND, 60, CURRENT_TIMESTAMP),
               CURRENT_TIMESTAMP,
               TIMESTAMPADD(MINUTE, 30, CURRENT_TIMESTAMP))`
    );
    const attemptId12 = tzInsert.insertId;

    const [tzQuery] = await rawDb.execute(
      `SELECT started_at, deadline_at, grading_lease_expires_at,
              TIMESTAMPDIFF(SECOND, started_at, deadline_at) AS diff_sec,
              TIMESTAMPDIFF(SECOND, CURRENT_TIMESTAMP, grading_lease_expires_at) AS lease_sec
       FROM exam_attempts WHERE id = ?`,
      [attemptId12]
    );

    const rowTz = tzQuery[0];
    const leaseSec = rowTz?.lease_sec;
    const diffSec = rowTz?.diff_sec;

    // Also read through backend repository pool (db.js)
    const repoAttempt = await attemptController._getQueueMap ? await (require('../src/repositories/attemptRepository')).findById(attemptId12) : null;
    const jsDeadlineDiff = (new Date(repoAttempt.deadline_at).getTime() - new Date(repoAttempt.started_at).getTime()) / 1000;
    const jsLeaseRemainSec = (new Date(repoAttempt.grading_lease_expires_at).getTime() - Date.now()) / 1000;

    assert(
      'TC-DAT-09',
      'DAT-R1 Đồng bộ Timezone UTC: MySQL TIMESTAMP & Node.js Date khớp 100%, không lệch 7 giờ',
      diffSec === 1800 &&
      leaseSec >= 55 && leaseSec <= 65 &&
      jsDeadlineDiff === 1800 &&
      jsLeaseRemainSec >= 50 && jsLeaseRemainSec <= 65,
      `diffSec: ${diffSec}, leaseSec: ${leaseSec}, jsDeadlineDiff: ${jsDeadlineDiff}, jsLeaseRemainSec: ${jsLeaseRemainSec}`
    );

    // -------------------------------------------------------------------------
    // TC-ARC-09: ARC-R2 Reconcile sau khi Finalizer ĐÃ CHẤM XONG (grading_status = 'graded')
    // Attempt đã bị Finalizer chốt expired và chấm 0 điểm. Request nộp bài hợp lệ
    // đến trước deadline hòa giải thành công: điểm cũ bị xóa, điểm mới tính chính xác 10/10.
    // -------------------------------------------------------------------------
    const deadline13 = new Date(Date.now() + 1000);
    const [attInsert13] = await rawDb.execute(
      `INSERT INTO exam_attempts (exam_id, student_id, attempt_number, status, grading_status, grading_fencing_token, raw_score, score, started_at, deadline_at)
       VALUES (701, 102, 13, 'expired', 'graded', 1, 0.00, 0.00, NOW(), ?)`,
      [deadline13]
    );
    const attemptId13 = attInsert13.insertId;

    await rawDb.execute(
      `INSERT INTO attempt_question_snapshots (attempt_id, question_id, question_order, question_type, weight, snapshot_data)
       SELECT ?, question_id, question_order, question_type, weight, snapshot_data
       FROM attempt_question_snapshots WHERE attempt_id = ?`,
      [attemptId13, attemptId1]
    );

    // Sinh viên nộp bài hợp lệ trước deadline kèm đáp án đúng
    const reconcilePostGradedRes = await request('POST', `/api/attempts/${attemptId13}/submit`, {
      answers: [
        { question_id: 501, selected_choice_ids: [601] },
        { question_id: 502, selected_choice_ids: [603, 604] }
      ]
    }, studentHeaders);

    const [attRec13] = await rawDb.execute(
      'SELECT status, grading_status, score, raw_score, grading_fencing_token FROM exam_attempts WHERE id = ?',
      [attemptId13]
    );

    assert(
      'TC-ARC-09',
      'ARC-R2 Reconcile sau khi Finalizer đã chấm xong: Xóa điểm 0 cũ, chấm lại điểm đúng 10/10',
      reconcilePostGradedRes.status === 200 &&
      reconcilePostGradedRes.body.status === 'completed' &&
      reconcilePostGradedRes.body.reconciled === true &&
      attRec13[0]?.status === 'completed' &&
      attRec13[0]?.grading_status === 'graded' &&
      Number(attRec13[0]?.score) === 10.00 &&
      attRec13[0]?.grading_fencing_token >= 2,
      `HTTP: ${reconcilePostGradedRes.status}, Status: ${attRec13[0]?.status}, Score: ${attRec13[0]?.score}, Fencing token: ${attRec13[0]?.grading_fencing_token}`
    );

    // -------------------------------------------------------------------------
    // TC-ARC-10: ARC-R2 Reconcile khi Finalizer ĐANG CHẤM DỞ (grading_status = 'grading')
    // Finalizer worker cũ đang giữ lease và token F=5. Request nộp bài hợp lệ
    // hòa giải tăng token lên F=6. Finalizer worker cũ hoàn tất muộn bị chặn với STALE_FENCING_TOKEN.
    // -------------------------------------------------------------------------
    const deadline14 = new Date(Date.now() + 1000);
    const leaseFuture14 = new Date(Date.now() + 25000); // 25s lease
    const initialFencingToken = 5;

    const [attInsert14] = await rawDb.execute(
      `INSERT INTO exam_attempts (exam_id, student_id, attempt_number, status, grading_status, grading_fencing_token, grading_lease_expires_at, started_at, deadline_at)
       VALUES (701, 102, 14, 'expired', 'grading', ?, ?, NOW(), ?)`,
      [initialFencingToken, leaseFuture14, deadline14]
    );
    const attemptId14 = attInsert14.insertId;

    await rawDb.execute(
      `INSERT INTO attempt_question_snapshots (attempt_id, question_id, question_order, question_type, weight, snapshot_data)
       SELECT ?, question_id, question_order, question_type, weight, snapshot_data
       FROM attempt_question_snapshots WHERE attempt_id = ?`,
      [attemptId14, attemptId1]
    );

    // Sinh viên nộp bài hợp lệ trước deadline
    const reconcileMidGradingRes = await request('POST', `/api/attempts/${attemptId14}/submit`, {
      answers: [
        { question_id: 501, selected_choice_ids: [601] },
        { question_id: 502, selected_choice_ids: [603, 604] }
      ]
    }, studentHeaders);

    // Finalizer worker cũ (chạy ngầm muộn) cố hoàn tất với token cũ = 5 và điểm = 0.0
    const staleFinalizerCompletion = await completeGradingJob(attemptId14, initialFencingToken, 0.0, 10.0, 0.0);

    const [attRec14] = await rawDb.execute(
      'SELECT status, grading_status, score, raw_score, grading_fencing_token FROM exam_attempts WHERE id = ?',
      [attemptId14]
    );

    assert(
      'TC-ARC-10',
      'ARC-R2 Reconcile khi Finalizer đang chấm dở: Vô hiệu hóa Finalizer cũ qua fencing token, chấm điểm mới',
      reconcileMidGradingRes.status === 200 &&
      reconcileMidGradingRes.body.status === 'completed' &&
      reconcileMidGradingRes.body.reconciled === true &&
      staleFinalizerCompletion.committed === false &&
      staleFinalizerCompletion.reason === 'STALE_FENCING_TOKEN' &&
      attRec14[0]?.status === 'completed' &&
      attRec14[0]?.grading_status === 'graded' &&
      Number(attRec14[0]?.score) === 10.00 &&
      attRec14[0]?.grading_fencing_token > initialFencingToken,
      `HTTP: ${reconcileMidGradingRes.status}, Stale reason: ${staleFinalizerCompletion.reason}, Score: ${attRec14[0]?.score}, Token: ${attRec14[0]?.grading_fencing_token}`
    );

  } finally {
    if (server) server.close();
    if (rawDb) await rawDb.end();
  }

  console.log('\n========================================================================');
  console.log(`   TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSuite().catch(err => {
  console.error('[SUITE_FATAL_ERROR]', err);
  process.exit(1);
});
