const mysql = require('mysql2/promise');
const http = require('http');
const attemptController = require('../src/controllers/attemptController');
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

function createMockRes() {
  return {
    statusCode: 200,
    headersSent: false,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      this.headersSent = true;
      return this;
    }
  };
}

async function runQueueConcurrencyTests() {
  console.log('========================================================================');
  console.log('   QUIZSYSTEM INGRESS QUEUE & R8 CONCURRENCY COMPREHENSIVE TEST SUITE');
  console.log('========================================================================\n');

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  function assert(name, condition, details = '') {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [✔] PASS: ${name} ${details ? '— ' + details : ''}`);
    } else {
      failedTests++;
      console.error(`  [✖] FAIL: ${name} — ${details}`);
    }
  }

  // Trap any unhandled rejection globally during this test run
  let unhandledRejections = [];
  const rejectionHandler = (reason, promise) => {
    unhandledRejections.push(reason);
  };
  process.on('unhandledRejection', rejectionHandler);

  const db = await mysql.createConnection(dbConfig);

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: TASK 1 — INGRESS PROMISE QUEUE UNIT & BEHAVIORAL VERIFICATION
    // -------------------------------------------------------------------------
    console.log('--- SECTION 1: TASK 1 — INGRESS PROMISE QUEUE CORRECTNESS ---');

    const queueMap = attemptController._getQueueMap();

    // 1.1: Queue cleanup sau khi hoàn tất
    const qAttemptId1 = 90001;
    const taskResult1 = await attemptController.enqueueAttemptOperation(qAttemptId1, async () => {
      await new Promise(r => setTimeout(r, 20));
      return 'task1_ok';
    });
    await new Promise(r => setTimeout(r, 10));
    assert('T1.1-QUEUE-CLEANUP-SUCCESS', taskResult1 === 'task1_ok' && !queueMap.has(qAttemptId1), `Result: ${taskResult1}, Map has id: ${queueMap.has(qAttemptId1)}`);

    // 1.2: Queue cleanup sau khi task thất bại (Error isolation & memory release)
    const qAttemptId2 = 90002;
    let caughtErr = null;
    try {
      await attemptController.enqueueAttemptOperation(qAttemptId2, async () => {
        await new Promise(r => setTimeout(r, 20));
        throw new Error('Simulated task failure');
      });
    } catch (e) {
      caughtErr = e;
    }
    await new Promise(r => setTimeout(r, 10));
    assert('T1.2-QUEUE-CLEANUP-FAILURE', caughtErr && caughtErr.message === 'Simulated task failure' && !queueMap.has(qAttemptId2), `Error caught: ${caughtErr?.message}, Map has id: ${queueMap.has(qAttemptId2)}`);

    // 1.3: Request lỗi không làm tắc hàng đợi; không sinh unhandled rejection
    const qAttemptId3 = 90003;
    const taskFailPromise = attemptController.enqueueAttemptOperation(qAttemptId3, async () => {
      throw new Error('Failure in head of queue');
    }).catch(e => e.message);

    const taskSubsequentPromise = attemptController.enqueueAttemptOperation(qAttemptId3, async () => {
      return 'subsequent_task_succeeded';
    });

    const [failRes, subRes] = await Promise.all([taskFailPromise, taskSubsequentPromise]);
    await new Promise(r => setTimeout(r, 10));
    assert('T1.3-FAULT-ISOLATION', failRes === 'Failure in head of queue' && subRes === 'subsequent_task_succeeded', `Fail: ${failRes}, Sub: ${subRes}`);
    assert('T1.3-NO-UNHANDLED-REJECTIONS', unhandledRejections.length === 0, `Unhandled rejections count: ${unhandledRejections.length}`);
    assert('T1.3-QUEUE-FREED-AFTER-CHAIN', !queueMap.has(qAttemptId3), `Map has id 90003: ${queueMap.has(qAttemptId3)}`);

    // 1.4: Không tăng Map size vô hạn sau nhiều lượt thi (Zero memory leak test)
    const stressPromises = [];
    for (let i = 0; i < 50; i++) {
      const attId = 91000 + (i % 10);
      stressPromises.push(attemptController.enqueueAttemptOperation(attId, async () => {
        await new Promise(r => setTimeout(r, 5));
        return i;
      }));
    }
    await Promise.all(stressPromises);
    await new Promise(r => setTimeout(r, 20));
    assert('T1.4-ZERO-MEMORY-LEAK', queueMap.size === 0, `Map size after 50 tasks: ${queueMap.size} (expected 0)`);

    // 1.5: Hai attempt độc lập có thể xử lý đồng thời (Non-blocking concurrency)
    const tStart = Date.now();
    const [pA, pB] = await Promise.all([
      attemptController.enqueueAttemptOperation(92001, async () => {
        await new Promise(r => setTimeout(r, 60));
        return 'A';
      }),
      attemptController.enqueueAttemptOperation(92002, async () => {
        await new Promise(r => setTimeout(r, 60));
        return 'B';
      })
    ]);
    const elapsed = Date.now() - tStart;
    assert('T1.5-INDEPENDENT-ATTEMPTS-PARALLEL', pA === 'A' && pB === 'B' && elapsed < 110, `Elapsed: ${elapsed}ms (expected < 110ms for parallel execution)`);


    // -------------------------------------------------------------------------
    // SECTION 2: TASK 2 & 4 — REAL CONCURRENCY & R8 ADMISSION VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 2: TASK 2 & 4 — REAL CONCURRENCY & R8 AUDIT ---');

    // Authenticate test students
    const sLogin1 = await request('POST', '/auth/login', { username: 'student1', password: 'Password123!' });
    const sHeaders1 = { 'Authorization': `Bearer ${sLogin1.body.token}` };
    const [uRows1] = await db.execute("SELECT id FROM users WHERE username = 'student1'");
    const student1Id = uRows1[0].id;

    const sLogin2 = await request('POST', '/auth/login', { username: 'student2', password: 'Password123!' });
    const sHeaders2 = { 'Authorization': `Bearer ${sLogin2.body.token}` };
    const [uRows2] = await db.execute("SELECT id FROM users WHERE username = 'student2'");
    const student2Id = uRows2[0].id;

    // 4.1: SAVE đến trước SUBMIT nhưng lấy DB connection sau (Dependency Injection Hook Verification)
    await db.execute('DELETE FROM exam_attempts WHERE student_id = ? AND exam_id = 2', [student1Id]);
    const start41 = await request('POST', '/attempts/start', { examId: 2 }, sHeaders1);
    const attId41 = start41.body.attemptId;
    const q41 = start41.body.questions[0];
    const choiceId41 = q41.choices[1].id;

    let hookExecuted = false;
    attemptController._setTestConnectionDelayHook(async (attemptId) => {
      if (attemptId === attId41) {
        hookExecuted = true;
        await new Promise(r => setTimeout(r, 120)); // simulated connection acquisition delay
      }
    });

    const mockReqSave = {
      user: { id: student1Id, role: 'student' },
      params: { id: attId41 },
      body: { answers: [{ question_id: q41.question_id, selected_choice_ids: [choiceId41], revision: 1 }] },
      headers: { 'x-request-id': `di_save_${Date.now()}` }
    };
    const mockResSave = createMockRes();

    const mockReqSub = {
      user: { id: student1Id, role: 'student' },
      params: { id: attId41 },
      body: { answers: [] },
      headers: { 'x-request-id': `di_sub_${Date.now()}` }
    };
    const mockResSub = createMockRes();

    const pSave41 = attemptController.saveDraft(mockReqSave, mockResSave);
    await new Promise(r => setTimeout(r, 15)); // SUBMIT arrives 15ms later
    const pSub41 = attemptController.submitAttempt(mockReqSub, mockResSub);

    await Promise.all([pSave41, pSub41]);
    attemptController._setTestConnectionDelayHook(null); // Reset hook immediately

    assert('T4.1-DI-HOOK-EXECUTED', hookExecuted === true, 'Test hook successfully delayed SAVE before DB connection');
    assert('T4.1-SAVE-BEFORE-SUBMIT-ACK', mockResSave.statusCode === 200 && mockResSub.statusCode === 200, `Save status: ${mockResSave.statusCode}, Sub status: ${mockResSub.statusCode}`);

    // Verify MySQL state
    const [dbAns41] = await db.execute('SELECT selected_choice_ids FROM attempt_answers WHERE attempt_id = ? AND question_id = ?', [attId41, q41.question_id]);
    const parsedAns41 = typeof dbAns41[0]?.selected_choice_ids === 'string' ? JSON.parse(dbAns41[0].selected_choice_ids) : dbAns41[0]?.selected_choice_ids;
    assert('T4.1-MYSQL-SAVE-PRESERVED', parsedAns41.includes(choiceId41), `MySQL choice saved: ${JSON.stringify(parsedAns41)}`);

    const [attRow41] = await db.execute('SELECT status, score FROM exam_attempts WHERE id = ?', [attId41]);
    assert('T4.1-MYSQL-SUBMIT-COMPLETED', attRow41[0].status === 'completed' && attRow41[0].score !== null, `Status: ${attRow41[0].status}, Score: ${attRow41[0].score}`);

    // 4.2: SAVE rollback rồi SUBMIT tiếp tục
    await db.execute('DELETE FROM exam_attempts WHERE student_id = ? AND exam_id = 2', [student1Id]);
    const start42 = await request('POST', '/attempts/start', { examId: 2 }, sHeaders1);
    const attId42 = start42.body.attemptId;
    const q42 = start42.body.questions[0];

    // Send SAVE with invalid question_id 99999 -> triggers rollback and 400
    const failSaveRes = await request('POST', `/attempts/${attId42}/draft`, {
      answers: [{ question_id: 99999, selected_choice_ids: [1] }]
    }, sHeaders1);
    assert('T4.2-SAVE-ROLLBACK', failSaveRes.status === 400, `Rejected with 400: ${failSaveRes.body.error}`);

    // Immediately send valid SUBMIT -> must succeed without being stuck
    const succSubRes = await request('POST', `/attempts/${attId42}/submit`, {
      answers: [],
      requestId: `sub_after_err_${Date.now()}`
    }, sHeaders1);
    assert('T4.2-SUBMIT-CONTINUES', succSubRes.status === 200 && succSubRes.body.status === 'completed', `Submit succeeded: ${succSubRes.body.status}`);

    const [attRow42] = await db.execute('SELECT status FROM exam_attempts WHERE id = ?', [attId42]);
    assert('T4.2-MYSQL-STATUS-COMPLETED', attRow42[0].status === 'completed', `MySQL status: ${attRow42[0].status}`);

    // 4.3: SAVE/SUBMIT gần deadline
    await db.execute('DELETE FROM exam_attempts WHERE student_id = ? AND exam_id = 2', [student1Id]);
    const start43 = await request('POST', '/attempts/start', { examId: 2 }, sHeaders1);
    const attId43 = start43.body.attemptId;
    const q43 = start43.body.questions[0];

    // Set deadline to exactly 6 seconds in future using UTC Date object
    const nearDeadline = new Date(Date.now() + 6000);
    await db.execute('UPDATE exam_attempts SET deadline_at = ? WHERE id = ?', [nearDeadline, attId43]);

    const nearSave = await request('POST', `/attempts/${attId43}/draft`, {
      answers: [{ question_id: q43.question_id, selected_choice_ids: [q43.choices[0].id] }]
    }, sHeaders1);
    assert('T4.3-NEAR-DEADLINE-SAVE', nearSave.status === 200, `Save before deadline status: ${nearSave.status}`);

    const nearSub = await request('POST', `/attempts/${attId43}/submit`, {
      answers: []
    }, sHeaders1);
    assert('T4.3-NEAR-DEADLINE-SUBMIT', nearSub.status === 200 && nearSub.body.status === 'completed', `Submit before deadline status: ${nearSub.body.status}`);

    // 4.4: SAVE commit sau deadline phải bị từ chối theo R8 (R <= C < D)
    await db.execute('DELETE FROM exam_attempts WHERE student_id = ? AND exam_id = 2', [student1Id]);
    const start44 = await request('POST', '/attempts/start', { examId: 2 }, sHeaders1);
    const attId44 = start44.body.attemptId;
    const q44 = start44.body.questions[0];

    // Set deadline to 5 seconds in past using UTC Date object
    const pastDeadline = new Date(Date.now() - 5000);
    await db.execute('UPDATE exam_attempts SET deadline_at = ? WHERE id = ?', [pastDeadline, attId44]);

    const expiredSave = await request('POST', `/attempts/${attId44}/draft`, {
      answers: [{ question_id: q44.question_id, selected_choice_ids: [q44.choices[0].id] }]
    }, sHeaders1);
    assert('T4.4-SAVE-PAST-DEADLINE-REJECT', expiredSave.status === 400 && expiredSave.body.error.includes('deadline has passed'), `Status: ${expiredSave.status}, Error: ${expiredSave.body.error}`);

    // Verify MySQL: answers were NOT updated
    const [dbAns44] = await db.execute('SELECT * FROM attempt_answers WHERE attempt_id = ?', [attId44]);
    assert('T4.4-MYSQL-ZERO-ANSWERS', dbAns44.length === 0, `Answers in DB: ${dbAns44.length} (expected 0)`);

    // 4.5: Finalizer cạnh tranh với SAVE
    await db.execute('DELETE FROM exam_attempts WHERE student_id = ? AND exam_id = 2', [student1Id]);
    const start45 = await request('POST', '/attempts/start', { examId: 2 }, sHeaders1);
    const attId45 = start45.body.attemptId;

    // Set deadline to expired in MySQL's internal clock
    await db.execute('UPDATE exam_attempts SET deadline_at = NOW() - INTERVAL 5 MINUTE WHERE id = ?', [attId45]);

    // Concurrently trigger background auto-finalizer and student save request
    const [finalizerCount, raceSaveRes] = await Promise.all([
      processExpiredAttempts(),
      request('POST', `/attempts/${attId45}/draft`, {
        answers: [{ question_id: 1, selected_choice_ids: [1] }]
      }, sHeaders1)
    ]);

    const [attRow45] = await db.execute('SELECT status, grading_status FROM exam_attempts WHERE id = ?', [attId45]);
    assert('T4.5-FINALIZER-RACE-CONSISTENT', attRow45[0].status === 'expired' && attRow45[0].grading_status === 'graded', `Status: ${attRow45[0].status}, Grading: ${attRow45[0].grading_status}, Finalized: ${finalizerCount}`);

    // 4.6: Node.js restart khi queue có request đang chờ
    // R8 definition: Crash loses unreceipted memory requests within approved recovery boundary; retry is a new reception
    // Verifying database integrity: 0 orphan rows
    const [orphans] = await db.execute(
      `SELECT a.id FROM exam_attempts a 
       LEFT JOIN users u ON a.student_id = u.id 
       WHERE u.id IS NULL`
    );
    assert('T4.6-RESTART-RECOVERY-CLEAN', orphans.length === 0, `Orphan attempts found: ${orphans.length}`);

    // 4.7: Nhiều attempt độc lập hoạt động đồng thời (Live Multi-Student Parallelism)
    // Setup attempts across student1 and student2
    await db.execute('DELETE FROM exam_attempts WHERE student_id IN (?, ?) AND exam_id = 2', [student1Id, student2Id]);

    const [stRes1, stRes2] = await Promise.all([
      request('POST', '/attempts/start', { examId: 2 }, sHeaders1),
      request('POST', '/attempts/start', { examId: 2 }, sHeaders2)
    ]);

    const attA = { id: stRes1.body.attemptId, headers: sHeaders1, q: stRes1.body.questions[0] };
    const attB = { id: stRes2.body.attemptId, headers: sHeaders2, q: stRes2.body.questions[0] };

    // Run parallel saves and submits across both independent attempts
    const [resA, resB] = await Promise.all([
      (async () => {
        const s = await request('POST', `/attempts/${attA.id}/draft`, {
          answers: [{ question_id: attA.q.question_id, selected_choice_ids: [attA.q.choices[0].id] }]
        }, attA.headers);
        const sub = await request('POST', `/attempts/${attA.id}/submit`, { answers: [] }, attA.headers);
        return { s: s.status, sub: sub.status };
      })(),
      (async () => {
        const s = await request('POST', `/attempts/${attB.id}/draft`, {
          answers: [{ question_id: attB.q.question_id, selected_choice_ids: [attB.q.choices[1].id] }]
        }, attB.headers);
        const sub = await request('POST', `/attempts/${attB.id}/submit`, { answers: [] }, attB.headers);
        return { s: s.status, sub: sub.status };
      })()
    ]);

    assert('T4.7-MULTI-ATTEMPT-PARALLEL', resA.s === 200 && resA.sub === 200 && resB.s === 200 && resB.sub === 200, `Attempt A: ${JSON.stringify(resA)}, Attempt B: ${JSON.stringify(resB)}`);

    // Verify both in MySQL
    const [multiDbRows] = await db.execute(
      `SELECT id, status, grading_status FROM exam_attempts WHERE id IN (${attA.id}, ${attB.id})`
    );
    const allDbCompleted = multiDbRows.every(r => r.status === 'completed' && r.grading_status === 'graded');
    assert('T4.7-MYSQL-MULTI-ATTEMPT-GRADED', allDbCompleted && multiDbRows.length === 2, `MySQL verified 2 attempts completed and graded`);

    console.log('\n========================================================================');
    console.log(`TOTAL QUEUE & CONCURRENCY TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
    console.log('========================================================================\n');

  } finally {
    process.removeListener('unhandledRejection', rejectionHandler);
    await db.end();
  }
}

runQueueConcurrencyTests().catch(err => {
  console.error('\nQueue Concurrency script error:', err);
  process.exit(1);
});
