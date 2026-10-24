const http = require('http');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const { processExpiredAttempts, processStaleGradingRecovery } = require('../src/services/finalizationService');

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

async function runMasterE2ETest() {
  console.log('========================================================================');
  console.log('  QUIZSYSTEM MASTER END-TO-END FLOW & EDGE CASE VERIFICATION (PHASE 05)');
  console.log('========================================================================\n');

  const db = await mysql.createConnection(dbConfig);
  let step = 1;

  try {
    // 1. Authenticate Teacher and Student
    console.log(`[STEP ${step++}] Authenticating Teacher and Student accounts...`);
    const tLogin = await request('POST', '/auth/login', { username: 'teacher1', password: 'Password123!' });
    if (tLogin.status !== 200) throw new Error('Teacher login failed');
    const tHeaders = { 'Authorization': `Bearer ${tLogin.body.token}` };

    const sLogin = await request('POST', '/auth/login', { username: 'student1', password: 'Password123!' });
    if (sLogin.status !== 200) throw new Error('Student login failed');
    const sHeaders = { 'Authorization': `Bearer ${sLogin.body.token}` };
    console.log('  ✓ Authenticated teacher1 and student1 successfully.');

    // 2. Teacher creates 2 new questions in the Question Bank
    console.log(`[STEP ${step++}] Teacher creates questions in question bank...`);
    const q1Res = await request('POST', '/questions', {
      title: `E2E Q1 - Network Protocols (${Date.now()})`,
      content: 'Giao thức nào thuộc tầng Transport trong mô hình OSI?',
      question_type: 'single_choice',
      subject: 'Mang May Tinh',
      difficulty: 'medium',
      choices: [
        { content: 'TCP', is_correct: true },
        { content: 'IP', is_correct: false },
        { content: 'HTTP', is_correct: false },
        { content: 'Ethernet', is_correct: false }
      ]
    }, tHeaders);
    const q1Id = q1Res.body.questionId;

    const q2Res = await request('POST', '/questions', {
      title: `E2E Q2 - DevOps Principles (${Date.now()})`,
      content: 'Công cụ nào sau đây là CI/CD server?',
      question_type: 'single_choice',
      subject: 'DevOps',
      difficulty: 'easy',
      choices: [
        { content: 'Jenkins', is_correct: true },
        { content: 'Prometheus', is_correct: false },
        { content: 'MySQL', is_correct: false }
      ]
    }, tHeaders);
    const q2Id = q2Res.body.questionId;
    console.log(`  ✓ Questions created with IDs: Q1=${q1Id}, Q2=${q2Id}`);

    // 3. Teacher creates a new Exam linked to Q1 and Q2
    console.log(`[STEP ${step++}] Teacher creates Exam with weights and configurations...`);
    const examRes = await request('POST', '/exams', {
      title: `Kỳ thi Thử nghiệm Toàn diện E2E - ${Date.now()}`,
      description: 'Đề thi kiểm tra tích hợp luồng đầy đủ từ tạo đề đến công bố kết quả',
      duration_minutes: 20,
      max_attempts: 2,
      pass_score: 5.0,
      access_type: 'public',
      questions: [
        { question_id: q1Id, weight: 5.0 },
        { question_id: q2Id, weight: 5.0 }
      ]
    }, tHeaders);
    const examId = examRes.body.examId;
    console.log(`  ✓ Exam created successfully with ID: ${examId}`);

    // Ensure exam scores are NOT published yet (default is_published_scores = 0)
    await db.execute('UPDATE exams SET is_published_scores = 0, is_published_answers = 0 WHERE id = ?', [examId]);

    // 4. Student discovers available exams and starts Attempt
    console.log(`[STEP ${step++}] Student views available exams and starts attempt...`);
    const availRes = await request('GET', '/attempts/available-exams', null, sHeaders);
    const foundExam = availRes.body.exams.find(e => e.id === examId);
    if (!foundExam) throw new Error('New exam not found in student available list');

    const startRes = await request('POST', '/attempts/start', { examId }, sHeaders);
    const attemptId = startRes.body.attemptId;
    const questions = startRes.body.questions;
    console.log(`  ✓ Attempt started with ID: ${attemptId}, Snapshot questions count: ${questions.length}`);
    console.log(`  ✓ Authoritative deadline: ${startRes.body.deadlineAt}`);

    // 5. Student answers Question 1 and Autosave is triggered with unique requestId
    console.log(`[STEP ${step++}] Student answers Q1 with Autosave + requestId...`);
    // Find correct choice ID for Q1
    const q1Snapshot = questions.find(q => q.question_id === q1Id);
    const q1ChoiceId = q1Snapshot.choices[0].id; // First choice is correct (TCP)

    const draftReqId = `req_draft_${attemptId}_${Date.now()}`;
    const draftPayload = [{ question_id: q1Id, selected_choice_ids: [q1ChoiceId] }];
    const saveRes = await request(
      'POST',
      `/attempts/${attemptId}/draft`,
      { answers: draftPayload, requestId: draftReqId },
      { ...sHeaders, 'X-Request-Id': draftReqId }
    );
    if (saveRes.status !== 200 || !saveRes.body.success) throw new Error('Autosave failed');
    console.log(`  ✓ Autosave successful with server ACK timestamp: ${saveRes.body.serverTime}`);

    // 6. Refresh simulation: Re-entering exam restores draft answers
    console.log(`[STEP ${step++}] Simulating page refresh and answer recovery...`);
    const resumeRes = await request('POST', '/attempts/start', { examId }, sHeaders);
    const restoredAnswers = resumeRes.body.answers;
    const restoredQ1 = restoredAnswers.find(a => a.question_id === q1Id);
    if (!restoredQ1 || !restoredQ1.selected_choice_ids.includes(q1ChoiceId)) {
      throw new Error('Draft answer recovery after refresh failed');
    }
    console.log('  ✓ Draft answers successfully restored after refresh simulation.');

    // 7. Student leaves Question 2 UNANSWERED (Edge Case: Incomplete exam)
    console.log(`[STEP ${step++}] Student leaves Q2 unanswered (Testing BD-04 partial completion rule)...`);

    // 8. Concurrent SUBMIT with identical requestId (Testing Idempotency & Lost ACK)
    console.log(`[STEP ${step++}] Concurrent submit with duplicate requestId race handling...`);
    const subReqId = `req_sub_${attemptId}_${Date.now()}`;
    const submitPayload = [{ question_id: q1Id, selected_choice_ids: [q1ChoiceId] }];

    const [subA, subB] = await Promise.all([
      request('POST', `/attempts/${attemptId}/submit`, { answers: submitPayload, requestId: subReqId }, { ...sHeaders, 'X-Request-Id': subReqId }),
      request('POST', `/attempts/${attemptId}/submit`, { answers: submitPayload, requestId: subReqId }, { ...sHeaders, 'X-Request-Id': subReqId })
    ]);

    if (subA.status !== 200 || subB.status !== 200) {
      throw new Error(`Concurrent submit race failed: subA=${subA.status}, subB=${subB.status}`);
    }
    console.log('  ✓ Concurrent submission handled safely with HTTP 200 on both requests.');

    // 9. Late SAVE attempt after submission rejected with HTTP 409 (R8-D09 Ordering barrier)
    console.log(`[STEP ${step++}] Testing late draft save on finalized attempt...`);
    const lateSaveRes = await request(
      'POST',
      `/attempts/${attemptId}/draft`,
      { answers: [{ question_id: q2Id, selected_choice_ids: [1] }] },
      sHeaders
    );
    if (lateSaveRes.status !== 409) {
      throw new Error(`Late draft save should return 409, got ${lateSaveRes.status}`);
    }
    console.log('  ✓ Late draft save strictly rejected with HTTP 409 Conflict.');

    // 10. Verify auto-grading and unanswered questions recording
    console.log(`[STEP ${step++}] Inspecting database for auto-grading outcome...`);
    const [attCheck] = await db.execute(
      'SELECT status, grading_status, raw_score, score FROM exam_attempts WHERE id = ?',
      [attemptId]
    );
    console.log(`  ✓ Attempt status: ${attCheck[0].status}, Grading: ${attCheck[0].grading_status}, Score: ${attCheck[0].score}/10.00 (Raw: ${attCheck[0].raw_score}/10.00)`);

    const [ansRows] = await db.execute(
      'SELECT question_id, selected_choice_ids, is_correct, score_awarded FROM attempt_answers WHERE attempt_id = ? ORDER BY question_id ASC',
      [attemptId]
    );
    const q1Ans = ansRows.find(a => a.question_id === q1Id);
    const q2Ans = ansRows.find(a => a.question_id === q2Id);

    if (q1Ans.is_correct !== 1 || parseFloat(q1Ans.score_awarded) !== 5.0) {
      throw new Error(`Q1 grading incorrect: is_correct=${q1Ans.is_correct}, score=${q1Ans.score_awarded}`);
    }
    if (q2Ans.is_correct !== 0 || parseFloat(q2Ans.score_awarded) !== 0.0) {
      throw new Error(`Q2 unanswered grading incorrect: is_correct=${q2Ans.is_correct}, score=${q2Ans.score_awarded}`);
    }
    console.log('  ✓ Q1 correctly awarded 5.0 points; Q2 unanswered recorded as 0 points with empty choices.');

    // 11. Student checks results BEFORE teacher publication
    console.log(`[STEP ${step++}] Student queries results before publication (BD-06 Privacy check)...`);
    const prePubRes = await request('GET', `/attempts/${attemptId}/result`, null, sHeaders);
    if (prePubRes.body.score !== null || prePubRes.body.questions !== undefined) {
      throw new Error('Leak detected! Scores or questions exposed before teacher publication');
    }
    console.log(`  ✓ Score hidden: "${prePubRes.body.scoreMessage}"`);

    // 12. Teacher publishes results via API
    console.log(`[STEP ${step++}] Teacher publishes scores and detailed answers via API...`);
    const pubRes = await request(
      'PATCH',
      `/exams/${examId}/publication`,
      { is_published_scores: true, is_published_answers: true },
      tHeaders
    );
    if (pubRes.status !== 200) throw new Error('Publication update failed');
    console.log('  ✓ Teacher successfully toggled publication on.');

    // 13. Student checks results AFTER teacher publication
    console.log(`[STEP ${step++}] Student queries results after publication...`);
    const postPubRes = await request('GET', `/attempts/${attemptId}/result`, null, sHeaders);
    if (postPubRes.body.score === null || !Array.isArray(postPubRes.body.questions)) {
      throw new Error('Score or detailed questions not visible after teacher publication');
    }
    console.log(`  ✓ Published Score: ${postPubRes.body.score}/10.00 (Pass threshold: ${postPubRes.body.passScore})`);
    console.log(`  ✓ Detailed questions reviewed: ${postPubRes.body.questions.length} questions returned.`);

    // 14. Auto-finalization of an unsubmitted expired attempt (No student submit)
    console.log(`[STEP ${step++}] Testing auto-finalization on expired attempt without submit...`);
    const [unsubmittedAtt] = await db.execute(
      `INSERT INTO exam_attempts (exam_id, student_id, attempt_number, status, started_at, deadline_at)
       VALUES (?, ?, 2, 'in_progress', NOW() - INTERVAL 30 MINUTE, NOW() - INTERVAL 10 MINUTE)`,
      [examId, sLogin.body.user.id]
    );
    const unsubmittedAttId = unsubmittedAtt.insertId;

    // Snapshot questions
    for (const eq of [ { qid: q1Id, w: 5.0 }, { qid: q2Id, w: 5.0 } ]) {
      const snap = {
        question_id: eq.qid,
        title: `Snapshot Q ${eq.qid}`,
        content: 'Content',
        choices: [ { id: 101, content: 'A', is_correct: true } ]
      };
      await db.execute(
        `INSERT INTO attempt_question_snapshots (attempt_id, question_id, question_order, question_type, weight, snapshot_data)
         VALUES (?, ?, 1, 'single_choice', ?, ?)`,
        [unsubmittedAttId, eq.qid, eq.w, JSON.stringify(snap)]
      );
    }

    // Trigger auto-finalizer background service
    await processExpiredAttempts();

    const [finalizedCheck] = await db.execute(
      'SELECT status, grading_status, score FROM exam_attempts WHERE id = ?',
      [unsubmittedAttId]
    );

    if (finalizedCheck[0].status !== 'expired' || finalizedCheck[0].grading_status !== 'graded') {
      throw new Error(`Auto-finalization failed: status=${finalizedCheck[0].status}, grading=${finalizedCheck[0].grading_status}`);
    }
    console.log(`  ✓ Unsubmitted attempt auto-finalized to 'expired' and auto-graded (Score: ${finalizedCheck[0].score}/10.00)`);

    console.log('\n========================================================================');
    console.log('   ALL 14 STEPS OF MASTER E2E LIFECYCLE & EDGE CASES PASSED PERFECTLY!');
    console.log('========================================================================\n');

  } finally {
    await db.end();
  }
}

runMasterE2ETest().catch(err => {
  console.error('\n✗ Master E2E Test Failed with error:', err.message);
  process.exit(1);
});
