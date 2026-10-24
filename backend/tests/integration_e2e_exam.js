/**
 * End-to-end integration test for Exam Taking, Draft Saving, Submitting, and Grading
 */
const http = require('http');

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers
    };
    http.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

function httpPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runE2EExamTest() {
  console.log('===============================================================');
  console.log('   QUIZSYSTEM END-TO-END EXAM TAKING & GRADING RUNTIME TEST');
  console.log('===============================================================\n');

  // 1. Login as student1
  console.log('[1] Logging in as student1...');
  const mysql = require('mysql2/promise');
  const dbConn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'quiz_user',
    password: 'QuizPass123!',
    database: 'quizsystem'
  });
  await dbConn.execute('DELETE FROM exam_attempts WHERE student_id = 3 AND exam_id = 1');
  await dbConn.end();

  const loginRes = await httpPost('http://localhost:80/api/auth/login', {
    username: 'student1',
    password: 'Password123!'
  });
  if (loginRes.statusCode !== 200 || !loginRes.body.token) {
    throw new Error('Failed to login student');
  }
  const token = loginRes.body.token;
  const authHeaders = { 'Authorization': `Bearer ${token}` };
  console.log('    ✓ Logged in successfully. Token acquired.');

  // 2. Fetch available exams
  console.log('[2] Fetching available exams for student1...');
  const examsRes = await httpGet('http://localhost:80/api/attempts/available-exams', authHeaders);
  if (examsRes.statusCode !== 200 || !examsRes.body.exams || examsRes.body.exams.length === 0) {
    throw new Error('Failed to retrieve exams list');
  }
  const exam1 = examsRes.body.exams.find(e => e.id === 1);
  console.log(`    ✓ Found exam: "${exam1.title}" (Duration: ${exam1.duration_minutes}m, Max attempts: ${exam1.max_attempts})`);

  // 3. Start or Resume Attempt
  console.log('[3] Starting attempt on Exam 1...');
  const startRes = await httpPost('http://localhost:80/api/attempts/start', { examId: 1 }, authHeaders);
  if (startRes.statusCode !== 200 || !startRes.body.attemptId) {
    throw new Error(`Failed to start attempt: ${JSON.stringify(startRes.body)}`);
  }
  const attemptId = startRes.body.attemptId;
  const questions = startRes.body.questions;
  console.log(`    ✓ Attempt #${startRes.body.attemptNumber} active (ID: ${attemptId}). Loaded ${questions.length} questions from immutable snapshot.`);
  console.log(`    ✓ Authoritative deadline set to: ${startRes.body.deadlineAt}`);

  // 4. Test Draft Saving (BD-05)
  console.log('[4] Saving draft answers for question 1 and question 2...');
  // Q1 is TCP (find choice for TCP)
  const q1 = questions[0];
  const q1TcpChoice = q1.choices.find(c => c.content.includes('TCP'));
  
  // Q2 is Multiple Choice (HTTP, HTTPS, SSH)
  const q2 = questions[1];
  const q2Choices = q2.choices.filter(c => c.content.includes('HTTP') || c.content.includes('HTTPS') || c.content.includes('SSH')).map(c => c.id);

  const draftPayload = [
    { question_id: q1.question_id, selected_choice_ids: [q1TcpChoice.id] },
    { question_id: q2.question_id, selected_choice_ids: q2Choices }
  ];

  const draftRes = await httpPost(`http://localhost:80/api/attempts/${attemptId}/draft`, { answers: draftPayload }, authHeaders);
  if (draftRes.statusCode !== 200 || !draftRes.body.success) {
    throw new Error(`Draft save failed: ${JSON.stringify(draftRes.body)}`);
  }
  console.log('    ✓ Draft answers buffered and saved to server.');

  // 5. Submit Attempt (BD-07, BD-08, BD-13)
  console.log('[5] Submitting exam attempt...');
  // Q3 is docker ps -a
  const q3 = questions[2];
  const q3DockerChoice = q3.choices.find(c => c.content.includes('docker ps -a'));

  // Q4 is Prometheus, Grafana, Loki
  const q4 = questions[3];
  const q4Choices = q4.choices.filter(c => c.content.includes('Prometheus') || c.content.includes('Grafana') || c.content.includes('Loki')).map(c => c.id);

  // Q5 is MySQL isolation
  const q5 = questions[4];
  const q5Choice = q5.choices.find(c => c.content.includes('Dirty Read'));

  const finalPayload = [
    { question_id: q1.question_id, selected_choice_ids: [q1TcpChoice.id] },
    { question_id: q2.question_id, selected_choice_ids: q2Choices },
    { question_id: q3.question_id, selected_choice_ids: [q3DockerChoice.id] },
    { question_id: q4.question_id, selected_choice_ids: q4Choices },
    { question_id: q5.question_id, selected_choice_ids: [q5Choice.id] }
  ];

  const submitRes = await httpPost(`http://localhost:80/api/attempts/${attemptId}/submit`, { answers: finalPayload }, authHeaders);
  if (submitRes.statusCode !== 200 || submitRes.body.status !== 'completed') {
    throw new Error(`Submit failed: ${JSON.stringify(submitRes.body)}`);
  }
  console.log(`    ✓ Attempt submitted successfully. Final status: '${submitRes.body.status}'.`);

  // 6. Verify Result & Scoring Calculation (BD-04 All-or-nothing, BD-08 /10.00 scale)
  console.log('[6] Verifying attempt results and score calculation...');
  const resultRes = await httpGet(`http://localhost:80/api/attempts/${attemptId}/result`, authHeaders);
  if (resultRes.statusCode !== 200) {
    throw new Error(`Failed to get result: ${JSON.stringify(resultRes.body)}`);
  }
  const result = resultRes.body.result || resultRes.body;
  console.log(`    ✓ Student: ${result.studentName}`);
  console.log(`    ✓ Raw Score: ${result.rawScore} / 5.00`);
  console.log(`    ✓ Normalized Score: ${result.score} / 10.00`);
  console.log(`    ✓ Pass Threshold: ${result.passScore} (Passed: ${result.score >= result.passScore})`);

  // Ensure exam publication flags allow viewing detailed answers
  const mysqlCli = require('mysql2/promise');
  const dbPub = await mysqlCli.createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'quiz_user',
    password: 'QuizPass123!',
    database: 'quizsystem'
  });
  await dbPub.execute('UPDATE exams SET is_published_scores = 1, is_published_answers = 1 WHERE id = 1');
  await dbPub.end();

  // Re-fetch result after publication enabled
  const pubResultRes = await httpGet(`http://localhost:80/api/attempts/${attemptId}/result`, authHeaders);
  const pubResult = pubResultRes.body.result || pubResultRes.body;

  if (parseFloat(pubResult.score) !== 10.00) {
    throw new Error(`Expected perfect score 10.00, got ${pubResult.score}`);
  }

  // Check detailed question correctness
  const allCorrect = pubResult.questions && pubResult.questions.every(q => q.isCorrect === true || q.is_correct === true);
  if (!allCorrect) {
    throw new Error('Not all questions were marked correct in All-or-Nothing evaluation');
  }
  console.log('    ✓ All 5 questions verified correct with exact set matching (BD-04).');

  console.log('\n===============================================================');
  console.log('   ALL E2E EXAM WORKFLOW CHECKS PASSED PERFECTLY (100% OK)   ');
  console.log('===============================================================');
}

runE2EExamTest().catch(err => {
  console.error('\nE2E Test Failed:', err.message);
  process.exit(1);
});
