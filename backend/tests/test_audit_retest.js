const http = require('http');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const { gradeAttempt, claimGradingJob, completeGradingJob } = require('../src/services/scoringService');
const { processExpiredAttempts, processStaleGradingRecovery } = require('../src/services/finalizationService');
const receiptRepo = require('../src/repositories/receiptRepository');

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

async function runAuditRetest() {
  console.log('========================================================================');
  console.log('   QUIZSYSTEM POST-IMPLEMENTATION COMPREHENSIVE AUDIT & RETEST');
  console.log('========================================================================\n');

  const db = await mysql.createConnection(dbConfig);
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

  try {
    // Acquire tokens
    const sLogin = await request('POST', '/auth/login', { username: 'student1', password: 'Password123!' });
    const sToken = sLogin.body.token;
    const sHeaders = { 'Authorization': `Bearer ${sToken}` };

    const tLogin = await request('POST', '/auth/login', { username: 'teacher1', password: 'Password123!' });
    const tToken = tLogin.body.token;
    const tHeaders = { 'Authorization': `Bearer ${tToken}` };

    const [uRows] = await db.execute("SELECT id FROM users WHERE username = 'student1'");
    const student1Id = uRows[0].id;

    console.log('--- SECTION 1: TASK 2 — AUTOSAVE & RESTORATION AUDIT ---');

    // T2.1: Chọn đáp án -> server ACK -> refresh -> khôi phục chính xác
    await db.execute('DELETE FROM exam_attempts WHERE student_id = ? AND exam_id = 2', [student1Id]);
    const startRes = await request('POST', '/attempts/start', { examId: 2 }, sHeaders);
    const attId = startRes.body.attemptId;
    const q1 = startRes.body.questions[0];

    const reqId1 = `req_save_${Date.now()}`;
    const saveRes1 = await request('POST', `/attempts/${attId}/draft`, {
      answers: [{ question_id: q1.question_id, selected_choice_ids: [q1.choices[0].id], revision: 1 }],
      requestId: reqId1
    }, { ...sHeaders, 'X-Request-Id': reqId1 });

    assert('T2.1-ACK', saveRes1.status === 200 && saveRes1.body.serverTime, `serverTime: ${saveRes1.body.serverTime}`);

    // Refresh simulation: Calling start again resumes the attempt and restores answers
    const refreshRes = await request('POST', '/attempts/start', { examId: 2 }, sHeaders);
    const restoredAns = refreshRes.body.answers.find(a => a.question_id === q1.question_id);
    assert('T2.1-RESTORE', restoredAns && restoredAns.selected_choice_ids.includes(q1.choices[0].id), 'Restored accurately');

    // T2.2: Đổi đáp án liên tiếp -> không bị ghi đè bởi request cũ (Revision guard)
    // Send revision 2 (choice B)
    const reqId2 = `req_save_rev2_${Date.now()}`;
    const saveRes2 = await request('POST', `/attempts/${attId}/draft`, {
      answers: [{ question_id: q1.question_id, selected_choice_ids: [q1.choices[1].id], revision: 2 }],
      requestId: reqId2
    }, { ...sHeaders, 'X-Request-Id': reqId2 });

    // Simulate delayed/stale revision 1 arriving later with choice A
    const reqIdLate = `req_save_late_${Date.now()}`;
    await request('POST', `/attempts/${attId}/draft`, {
      answers: [{ question_id: q1.question_id, selected_choice_ids: [q1.choices[0].id], revision: 1 }],
      requestId: reqIdLate
    }, { ...sHeaders, 'X-Request-Id': reqIdLate });

    // Verify DB still holds revision 2 (choice B), NOT overwritten by stale revision 1
    const [revCheck] = await db.execute('SELECT selected_choice_ids, revision FROM attempt_answers WHERE attempt_id = ? AND question_id = ?', [attId, q1.question_id]);
    const currentChoices = typeof revCheck[0].selected_choice_ids === 'string' ? JSON.parse(revCheck[0].selected_choice_ids) : revCheck[0].selected_choice_ids;
    assert('T2.2-REVISION-GUARD', currentChoices.includes(q1.choices[1].id) && revCheck[0].revision >= 2, `DB choice: ${JSON.stringify(currentChoices)}, rev: ${revCheck[0].revision}`);

    // T2.3: Reconnect before deadline vs after deadline
    // Reconnect before deadline: valid
    const reconBeforeReqId = `req_recon_before_${Date.now()}`;
    const reconBeforeRes = await request('POST', `/attempts/${attId}/draft`, {
      answers: [{ question_id: q1.question_id, selected_choice_ids: [q1.choices[0].id], revision: 3 }],
      requestId: reconBeforeReqId
    }, { ...sHeaders, 'X-Request-Id': reconBeforeReqId });
    assert('T2.3-RECON-BEFORE', reconBeforeRes.status === 200, 'Accepted before deadline');

    // Reconnect after deadline: rejected with HTTP 400
    await db.execute('UPDATE exam_attempts SET deadline_at = NOW() - INTERVAL 1 MINUTE WHERE id = ?', [attId]);
    const reconAfterReqId = `req_recon_after_${Date.now()}`;
    const reconAfterRes = await request('POST', `/attempts/${attId}/draft`, {
      answers: [{ question_id: q1.question_id, selected_choice_ids: [q1.choices[0].id], revision: 4 }],
      requestId: reconAfterReqId
    }, { ...sHeaders, 'X-Request-Id': reconAfterReqId });
    assert('T2.3-RECON-AFTER-EXPIRED', reconAfterRes.status === 400 && reconAfterRes.body.error.includes('deadline has passed'), 'Strictly rejected with 400');


    console.log('\n--- SECTION 2: TASK 3 — SAVE/SUBMIT CONCURRENCY & TRANSACTION AUDIT ---');

    // Create fresh attempt for concurrency testing
    await db.execute('DELETE FROM exam_attempts WHERE student_id = ? AND exam_id = 2', [student1Id]);
    const concStart = await request('POST', '/attempts/start', { examId: 2 }, sHeaders);
    const concAttId = concStart.body.attemptId;
    const concQ1 = concStart.body.questions[0];

    // T3.1: Hai request trùng requestId, cùng payload -> 200 OK cached response
    const dupSameReqId = `req_dup_same_${Date.now()}`;
    const dupPayload = [{ question_id: concQ1.question_id, selected_choice_ids: [concQ1.choices[0].id] }];
    const resA = await request('POST', `/attempts/${concAttId}/draft`, { answers: dupPayload, requestId: dupSameReqId }, { ...sHeaders, 'X-Request-Id': dupSameReqId });
    const resB = await request('POST', `/attempts/${concAttId}/draft`, { answers: dupPayload, requestId: dupSameReqId }, { ...sHeaders, 'X-Request-Id': dupSameReqId });
    assert('T3.1-DUP-SAME-PAYLOAD', resA.status === 200 && resB.status === 200 && resA.body.serverTime === resB.body.serverTime, 'Cached response returned identically');

    // T3.2: Hai request trùng requestId, khác payload -> 409 Conflict
    const dupDiffPayload = [{ question_id: concQ1.question_id, selected_choice_ids: [concQ1.choices[1].id] }];
    const resConflict = await request('POST', `/attempts/${concAttId}/draft`, { answers: dupDiffPayload, requestId: dupSameReqId }, { ...sHeaders, 'X-Request-Id': dupSameReqId });
    assert('T3.2-DUP-DIFF-PAYLOAD', resConflict.status === 409, 'Conflict detected and rejected with 409');

    // T3.3: Hai request khác requestId gửi đồng thời -> cả 2 đều thành công 200 OK
    const [c1, c2] = await Promise.all([
      request('POST', `/attempts/${concAttId}/draft`, { answers: dupPayload, requestId: `c1_${Date.now()}` }, sHeaders),
      request('POST', `/attempts/${concAttId}/draft`, { answers: dupPayload, requestId: `c2_${Date.now()}` }, sHeaders)
    ]);
    assert('T3.3-CONCURRENT-DIFF-REQID', c1.status === 200 && c2.status === 200, 'Both concurrent saves succeeded without error');

    // T3.4: Lost ACK reconciliation on SUBMIT
    const subLostReqId = `req_sub_lost_${Date.now()}`;
    const subRes1 = await request('POST', `/attempts/${concAttId}/submit`, { answers: dupPayload, requestId: subLostReqId }, { ...sHeaders, 'X-Request-Id': subLostReqId });
    const subRes2 = await request('POST', `/attempts/${concAttId}/submit`, { answers: dupPayload, requestId: subLostReqId }, { ...sHeaders, 'X-Request-Id': subLostReqId });
    assert('T3.4-LOST-ACK-SUBMIT', subRes1.status === 200 && subRes2.status === 200 && subRes2.body.message.includes('successfully'), 'Lost ACK replay returns cached 200 OK');

    // T3.5: SAVE nhận trước SUBMIT nhưng bị chậm lấy connection -> Ingress FIFO queue bảo đảm SAVE commit trước SUBMIT
    // Create dedicated attempt for delayed connection race
    await db.execute('DELETE FROM exam_attempts WHERE student_id = ? AND exam_id = 2', [student1Id]);
    const raceStart = await request('POST', '/attempts/start', { examId: 2 }, sHeaders);
    const raceAttId = raceStart.body.attemptId;
    const raceQ1 = raceStart.body.questions[0];
    const targetChoiceId = raceQ1.choices[1].id;

    const saveReqPromise = request('POST', `/attempts/${raceAttId}/draft`, {
      answers: [{ question_id: raceQ1.question_id, selected_choice_ids: [targetChoiceId], revision: 1 }],
      requestId: `race_save_${Date.now()}`
    }, sHeaders);

    // Send SUBMIT 20ms later (no delay)
    await new Promise(r => setTimeout(r, 20));
    const submitReqPromise = request('POST', `/attempts/${raceAttId}/submit`, {
      answers: [], // empty batch; relies on previous draft
      requestId: `race_sub_${Date.now()}`
    }, sHeaders);

    const [raceSaveRes, raceSubRes] = await Promise.all([saveReqPromise, submitReqPromise]);

    assert('T3.5-SAVE-BEFORE-SUBMIT-ACK', raceSaveRes.status === 200, `SAVE status: ${raceSaveRes.status}`);
    assert('T3.5-SUBMIT-AFTER-SAVE-ACK', raceSubRes.status === 200, `SUBMIT status: ${raceSubRes.status}`);

    // DIRECT MYSQL DATABASE VERIFICATION
    const [savedAnsRows] = await db.execute(
      'SELECT selected_choice_ids, revision FROM attempt_answers WHERE attempt_id = ? AND question_id = ?',
      [raceAttId, raceQ1.question_id]
    );
    const actualChoiceIds = typeof savedAnsRows[0]?.selected_choice_ids === 'string'
      ? JSON.parse(savedAnsRows[0].selected_choice_ids)
      : (savedAnsRows[0]?.selected_choice_ids || []);
    assert(
      'T3.5-MYSQL-DATA-PRESERVED',
      actualChoiceIds.includes(targetChoiceId),
      `MySQL attempt_answers choice: ${JSON.stringify(actualChoiceIds)} contains ${targetChoiceId}`
    );

    const [attemptFinalRow] = await db.execute(
      'SELECT status, grading_status, score FROM exam_attempts WHERE id = ?',
      [raceAttId]
    );
    assert(
      'T3.5-MYSQL-ATTEMPT-COMPLETED',
      attemptFinalRow[0].status === 'completed' && attemptFinalRow[0].grading_status === 'graded',
      `status: ${attemptFinalRow[0].status}, score: ${attemptFinalRow[0].score}`
    );

    // T3.6: LATE SAVE sau khi SUBMIT đã kết thúc -> 409 Conflict (Finalization barrier)
    const lateSave = await request('POST', `/attempts/${raceAttId}/draft`, {
      answers: [{ question_id: raceQ1.question_id, selected_choice_ids: [raceQ1.choices[0].id], revision: 2 }],
      requestId: `late_${Date.now()}`
    }, sHeaders);
    assert(
      'T3.6-LATE-SAVE-REJECT',
      lateSave.status === 409 && lateSave.body.error.includes('completed'),
      'Rejected with HTTP 409 Conflict'
    );

    // Verify MySQL was NOT modified by late save
    const [postLateRows] = await db.execute(
      'SELECT selected_choice_ids FROM attempt_answers WHERE attempt_id = ? AND question_id = ?',
      [raceAttId, raceQ1.question_id]
    );
    const postLateChoiceIds = typeof postLateRows[0]?.selected_choice_ids === 'string'
      ? JSON.parse(postLateRows[0].selected_choice_ids)
      : (postLateRows[0]?.selected_choice_ids || []);
    assert(
      'T3.6-MYSQL-IMMUTABLE-AFTER-SUBMIT',
      !postLateChoiceIds.includes(raceQ1.choices[0].id) && postLateChoiceIds.includes(targetChoiceId),
      `MySQL choice preserved: ${JSON.stringify(postLateChoiceIds)}`
    );


    console.log('\n--- SECTION 3: TASK 4 — AUTO-FINALIZATION & GRADING CORRECTNESS ---');

    // T4.1: Student làm 1 phần đề rồi hết giờ -> Auto-finalizer chốt và chấm chính xác
    await db.execute('DELETE FROM exam_attempts WHERE student_id = ? AND exam_id = 2', [student1Id]);
    const partialStart = await request('POST', '/attempts/start', { examId: 2 }, sHeaders);
    const partialAttId = partialStart.body.attemptId;
    const partialQuestions = partialStart.body.questions;

    // Student only answers Question 1 with correct choice
    const [q1Choices] = await db.execute('SELECT id FROM question_choices WHERE question_id = ? AND is_correct = 1', [partialQuestions[0].question_id]);
    const correctCid = q1Choices[0].id;
    await request('POST', `/attempts/${partialAttId}/draft`, {
      answers: [{ question_id: partialQuestions[0].question_id, selected_choice_ids: [correctCid] }]
    }, sHeaders);

    // Leave remaining questions unanswered, simulate deadline expired
    await db.execute('UPDATE exam_attempts SET deadline_at = NOW() - INTERVAL 5 MINUTE WHERE id = ?', [partialAttId]);

    // Background finalizer triggers
    const finalizedCount = await processExpiredAttempts();
    assert('T4.1-FINALIZER-RUN', finalizedCount >= 1, `Auto-finalized ${finalizedCount} attempt(s)`);

    // Verify attempt status and score in DB
    const [finalCheck] = await db.execute('SELECT status, grading_status, score FROM exam_attempts WHERE id = ?', [partialAttId]);
    assert('T4.1-STATUS-EXPIRED', finalCheck[0].status === 'expired' && finalCheck[0].grading_status === 'graded', `status: ${finalCheck[0].status}, grading: ${finalCheck[0].grading_status}`);

    // T4.2: Câu chưa trả lời ghi nhận 0 điểm, câu đã trả lời KHÔNG bị ghi đè thành câu bỏ trống
    const [ansCheck] = await db.execute('SELECT question_id, selected_choice_ids, is_correct, score_awarded FROM attempt_answers WHERE attempt_id = ? ORDER BY question_id ASC', [partialAttId]);
    const answeredRecord = ansCheck.find(a => a.question_id === partialQuestions[0].question_id);
    const unansweredRecord = ansCheck.find(a => a.question_id !== partialQuestions[0].question_id);

    const answeredChoiceIds = typeof answeredRecord.selected_choice_ids === 'string' ? JSON.parse(answeredRecord.selected_choice_ids) : answeredRecord.selected_choice_ids;
    assert('T4.2-ANSWERED-PRESERVED', answeredRecord.is_correct === 1 && answeredChoiceIds.includes(correctCid), `Choice ${correctCid} preserved, score awarded: ${answeredRecord.score_awarded}`);
    assert('T4.2-UNANSWERED-EXPLICIT-ZERO', unansweredRecord && unansweredRecord.is_correct === 0 && (unansweredRecord.score_awarded === 0 || unansweredRecord.score_awarded === '0.00'), 'Unanswered question explicitly 0 points');

    // T4.3: Điểm và đáp án KHÔNG bị lộ trước khi Teacher công bố
    await db.execute('UPDATE exams SET is_published_scores = 0, is_published_answers = 0 WHERE id = 2');
    const secretRes = await request('GET', `/attempts/${partialAttId}/result`, null, sHeaders);
    assert('T4.3-PUBLICATION-GATE', secretRes.body.score === null && secretRes.body.questions === undefined, 'Scores and answer keys strictly masked');

    // T4.4: Stale grading worker crash recovery with optimistic fencing token
    const [tokenRow] = await db.execute('SELECT grading_fencing_token FROM exam_attempts WHERE id = ?', [partialAttId]);
    const currentToken = tokenRow[0].grading_fencing_token;

    // Simulate stale worker trying to complete grading with obsolete fencing token
    const staleCompletion = await completeGradingJob(partialAttId, currentToken - 1, 10, 10, 10);
    assert('T4.4-STALE-TOKEN-REJECTED', staleCompletion.committed === false && staleCompletion.reason === 'STALE_FENCING_TOKEN', 'Stale worker rejected by optimistic fencing lock');


    console.log('\n========================================================================');
    console.log(`TOTAL AUDIT TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
    console.log('========================================================================\n');

  } finally {
    await db.end();
  }
}

runAuditRetest().catch(err => {
  console.error('\nAudit Retest script error:', err);
  process.exit(1);
});
