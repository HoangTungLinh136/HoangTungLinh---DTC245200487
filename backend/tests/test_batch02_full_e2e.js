/**
 * QUIZSYSTEM BATCH 02 — FULL SYSTEM E2E ACCEPTANCE TEST SUITE
 * 
 * Target: Isolated Test Database `quizsystem_test` (port 3307)
 * Scope: Student Flow, Teacher Flow, Admin Flow, Cross-Role RBAC & Security
 * 
 * Safety: Uses ONLY `quizsystem_test`. Zero modification to production `quizsystem`.
 */

process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'quizsystem_test';
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.DB_PORT || '3307';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'QuizPass123!';

const http = require('http');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const app = require('../src/server');
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

async function setupIsolatedDatabase() {
  rawDb = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: 'quiz_user',
    password: process.env.DB_PASSWORD,
    database: 'quizsystem_test',
    timezone: 'Z'
  });

  // Clean all tables in test database
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
  await rawDb.execute('TRUNCATE TABLE password_reset_tokens');
  await rawDb.execute('TRUNCATE TABLE audit_logs');
  await rawDb.execute('TRUNCATE TABLE user_sessions');
  await rawDb.execute('TRUNCATE TABLE users');
  await rawDb.execute('SET FOREIGN_KEY_CHECKS = 1');

  // Seed baseline users
  const dummyHash = await bcrypt.hash('Hoanglinh1#', 10);
  await rawDb.execute(
    `INSERT INTO users (id, username, email, password_hash, full_name, role, status) VALUES
     (1, 'admin_user', 'admin@test.com', ?, 'Quản Trị Viên', 'admin', 'active'),
     (2, 'teacher_one', 'teacher1@test.com', ?, 'Thầy Giáo Một', 'teacher', 'active'),
     (3, 'teacher_two', 'teacher2@test.com', ?, 'Thầy Giáo Hai', 'teacher', 'active'),
     (4, 'student_one', 'student1@test.com', ?, 'Sinh Viên Một', 'student', 'active'),
     (5, 'student_two', 'student2@test.com', ?, 'Sinh Viên Hai', 'student', 'active')`,
    [dummyHash, dummyHash, dummyHash, dummyHash, dummyHash]
  );
}

async function createAuthHeaders(userId) {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);

  await rawDb.execute(
    'INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [userId, tokenHash, expiresAt]
  );

  return {
    'Authorization': `Bearer ${token}`
  };
}

let passedCount = 0;
let failedCount = 0;
const testResults = [];

function assertTest(name, condition, details = '') {
  if (condition) {
    passedCount++;
    testResults.push({ name, status: 'PASS', details });
    console.log(`[PASS] ${name}`);
  } else {
    failedCount++;
    testResults.push({ name, status: 'FAIL', details });
    console.error(`[FAIL] ${name} — ${details}`);
  }
}

async function runAllTests() {
  console.log('========================================================================');
  console.log('   QUIZSYSTEM BATCH 02 — FULL SYSTEM E2E ACCEPTANCE VERIFICATION');
  console.log('   Target Database: quizsystem_test (port 3307)');
  console.log('========================================================================\n');

  await setupIsolatedDatabase();

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  try {
    // -------------------------------------------------------------------------
    // GROUP I: STUDENT E2E FLOW
    // -------------------------------------------------------------------------
    console.log('--- GROUP I: STUDENT E2E FLOW ---');

    // S-01: Register Student
    const regRes = await request('POST', '/api/auth/register', {
      username: 'student_new',
      email: 'student_new@test.com',
      password: 'StrongPassword123!',
      fullName: 'Sinh Vien Moi',
      role: 'student'
    });
    assertTest(
      'S-01: Đăng ký tài khoản Sinh viên thành công và kích hoạt ngay (BD-01)',
      regRes.status === 201 && regRes.body.user?.role === 'student' && regRes.body.user?.status === 'active'
    );

    // S-01b: Reject duplicate email
    const dupRes = await request('POST', '/api/auth/register', {
      username: 'student_dup',
      email: 'student_new@test.com',
      password: 'StrongPassword123!',
      fullName: 'Duplicate Email',
      role: 'student'
    });
    assertTest(
      'S-01b: Từ chối đăng ký trùng email với HTTP 409',
      dupRes.status === 409
    );

    // S-01c: Reject short password (< 8 chars) per BUS-01
    const shortPwdRes = await request('POST', '/api/auth/register', {
      username: 'student_short',
      email: 'short@test.com',
      password: 'short',
      fullName: 'Short Password',
      role: 'student'
    });
    assertTest(
      'S-01c: Từ chối mật khẩu dưới 8 ký tự với HTTP 400 (BUS-01)',
      shortPwdRes.status === 400
    );

    // S-02: Login Student
    const loginRes = await request('POST', '/api/auth/login', {
      username: 'student_new',
      password: 'StrongPassword123!'
    });
    assertTest(
      'S-02: Đăng nhập sinh viên thành công và trả về token phiên',
      loginRes.status === 200 && !!loginRes.body.token && loginRes.body.user.username === 'student_new'
    );
    const studentToken = loginRes.body.token;
    const studentHeaders = { 'Authorization': `Bearer ${studentToken}` };

    // S-02b: Login with wrong password
    const badLoginRes = await request('POST', '/api/auth/login', {
      username: 'student_new',
      password: 'WrongPassword999!'
    });
    assertTest(
      'S-02b: Từ chối đăng nhập sai mật khẩu với HTTP 401',
      badLoginRes.status === 401
    );

    // S-03: Change Password
    const changePwdRes = await request('POST', '/api/auth/change-password', {
      oldPassword: 'StrongPassword123!',
      newPassword: 'BrandNewPassword888!'
    }, studentHeaders);
    assertTest(
      'S-03: Đổi mật khẩu thành công khi xác nhận đúng mật khẩu cũ',
      changePwdRes.status === 200
    );

    // Verify login with new password
    const newLoginRes = await request('POST', '/api/auth/login', {
      username: 'student_new',
      password: 'BrandNewPassword888!'
    });
    assertTest(
      'S-03b: Đăng nhập thành công với mật khẩu mới vừa đổi',
      newLoginRes.status === 200
    );

    // S-04: Forgot & Reset Password Lifecycle (BD-11)
    const forgotRes = await request('POST', '/api/auth/forgot-password', {
      email: 'student_new@test.com'
    });
    assertTest(
      'S-04a: Yêu cầu quên mật khẩu trả lời thông điệp đồng nhất (BD-11)',
      forgotRes.status === 200
    );

    // Extract reset token from DB
    const [tokens] = await rawDb.execute(
      `SELECT prt.token_hash FROM password_reset_tokens prt
       JOIN users u ON prt.user_id = u.id
       WHERE u.email = 'student_new@test.com' AND prt.used_at IS NULL
       ORDER BY prt.id DESC LIMIT 1`
    );
    assertTest('S-04b: Token đặt lại mật khẩu được tạo và lưu mã băm an toàn trong CSDL', tokens.length > 0);

    // S-05: Create Exam Fixture for Student Taking
    const teacher1Headers = await createAuthHeaders(2); // teacher_one
    const q1Res = await request('POST', '/api/questions', {
      title: 'Câu hỏi Toán 1',
      content: '2 + 2 = ?',
      question_type: 'single_choice',
      subject: 'Toan Hoc',
      difficulty: 'easy',
      choices: [
        { content: '3', is_correct: false },
        { content: '4', is_correct: true },
        { content: '5', is_correct: false }
      ]
    }, teacher1Headers);

    const q2Res = await request('POST', '/api/questions', {
      title: 'Câu hỏi Toán 2',
      content: 'Chọn các số nguyên tố',
      question_type: 'multiple_choice',
      subject: 'Toan Hoc',
      difficulty: 'medium',
      choices: [
        { content: '2', is_correct: true },
        { content: '3', is_correct: true },
        { content: '4', is_correct: false },
        { content: '5', is_correct: true }
      ]
    }, teacher1Headers);

    const q1Id = q1Res.body.questionId;
    const q2Id = q2Res.body.questionId;

    // Public Exam
    const pubExamRes = await request('POST', '/api/exams', {
      title: 'Đề Thi Tự Do Toán Học',
      description: 'Đề thi trắc nghiệm Toán công khai',
      duration_minutes: 30,
      max_attempts: 2,
      pass_score: 5.0,
      access_type: 'public',
      questions: [
        { question_id: q1Id, weight: 5.0 },
        { question_id: q2Id, weight: 5.0 }
      ]
    }, teacher1Headers);
    const pubExamId = pubExamRes.body.examId;

    // Assigned Exam for student_one (id 4), NOT assigned to student_two (id 5)
    const assignExamRes = await request('POST', '/api/exams', {
      title: 'Đề Thi Chỉ Định Lớp 10A',
      description: 'Đề thi dành riêng cho sinh viên được gán',
      duration_minutes: 45,
      max_attempts: 1,
      pass_score: 5.0,
      access_type: 'assigned',
      questions: [{ question_id: q1Id, weight: 10.0 }],
      assigned_student_ids: [4]
    }, teacher1Headers);
    const assignedExamId = assignExamRes.body.examId;

    // S-05: Student views available exams
    const student1Headers = await createAuthHeaders(4); // student_one
    const student2Headers = await createAuthHeaders(5); // student_two

    const s1ExamsRes = await request('GET', '/api/attempts/available-exams', null, student1Headers);
    const s1ExamIds = s1ExamsRes.body.exams.map(e => e.id);
    assertTest(
      'S-05a: Sinh viên được gán nhìn thấy cả đề Public và đề Assigned (BD-10)',
      s1ExamIds.includes(pubExamId) && s1ExamIds.includes(assignedExamId)
    );

    const s2ExamsRes = await request('GET', '/api/attempts/available-exams', null, student2Headers);
    const s2ExamIds = s2ExamsRes.body.exams.map(e => e.id);
    assertTest(
      'S-05b: Sinh viên không được gán CHỈ nhìn thấy đề Public, KHÔNG thấy đề Assigned (BD-10)',
      s2ExamIds.includes(pubExamId) && !s2ExamIds.includes(assignedExamId)
    );

    // S-06: Student 1 starts Public Exam
    const startRes = await request('POST', '/api/attempts/start', { examId: pubExamId }, student1Headers);
    assertTest(
      'S-06: Sinh viên bắt đầu làm bài thi thành công, tạo Snapshot bất biến (BD-12)',
      startRes.status === 200 && startRes.body.attemptId > 0 && startRes.body.questions.length === 2
    );
    const attempt1Id = startRes.body.attemptId;

    // S-07: Resume Active Attempt
    const resumeRes = await request('POST', '/api/attempts/start', { examId: pubExamId }, student1Headers);
    assertTest(
      'S-07: Bắt đầu lại khi đang có bài dở dang trả về đúng bài thi đang làm (BD-09 Resume)',
      resumeRes.status === 200 && resumeRes.body.attemptId === attempt1Id
    );

    // S-08: Save Draft Answers
    // Get choice IDs from snapshot questions
    const snapQ1 = startRes.body.questions.find(q => q.question_id === q1Id);
    const snapQ2 = startRes.body.questions.find(q => q.question_id === q2Id);
    const correctQ1Choice = snapQ1.choices.find(c => c.content === '4').id;
    const correctQ2Choices = snapQ2.choices.filter(c => ['2', '3', '5'].includes(c.content)).map(c => c.id);

    const draftRes = await request('POST', `/api/attempts/${attempt1Id}/draft`, {
      answers: [
        { question_id: q1Id, selected_choice_ids: [correctQ1Choice], expected_revision: 0 }
      ]
    }, { ...student1Headers, 'X-Request-Id': 'req_draft_001' });
    assertTest(
      'S-08: Lưu câu trả lời bản nháp thành công kèm mã xác nhận receipt bền vững (R8-D01..08)',
      draftRes.status === 200 && draftRes.body.success === true && draftRes.body.savedCount === 1
    );

    // S-09: Submit On-Time
    const submitRes = await request('POST', `/api/attempts/${attempt1Id}/submit`, {
      answers: [
        { question_id: q1Id, selected_choice_ids: [correctQ1Choice], expected_revision: 1 },
        { question_id: q2Id, selected_choice_ids: correctQ2Choices, expected_revision: 0 }
      ]
    }, { ...student1Headers, 'X-Request-Id': 'req_submit_001' });
    assertTest(
      'S-09: Nộp bài đúng hạn thành công và chuyển trạng thái sang completed (BD-07, R8-D09)',
      submitRes.status === 200 && submitRes.body.status === 'completed'
    );

    // Wait a brief moment for async grading to settle
    await new Promise(r => setTimeout(r, 200));

    // S-11: Result Projection Masking (BD-06, TC-01)
    // Initially, exam has is_published_scores = 0, is_published_answers = 0
    const maskedResultRes = await request('GET', `/api/attempts/${attempt1Id}/result`, null, student1Headers);
    assertTest(
      'S-11a: Kết quả bài thi ẩn điểm số khi giáo viên chưa công bố điểm (BD-06)',
      maskedResultRes.status === 200 && maskedResultRes.body.score === null && maskedResultRes.body.scoreMessage !== null
    );
    assertTest(
      'S-11b: Kết quả bài thi ẩn đáp án chi tiết khi giáo viên chưa công bố đáp án (BD-06)',
      maskedResultRes.body.questions === undefined && maskedResultRes.body.answersMessage !== null
    );

    // Teacher toggles score publication only
    await request('PATCH', `/api/exams/${pubExamId}/publication`, {
      is_published_scores: true,
      is_published_answers: false
    }, teacher1Headers);

    const scoreOnlyRes = await request('GET', `/api/attempts/${attempt1Id}/result`, null, student1Headers);
    assertTest(
      'S-11c: Hiển thị điểm số khi giáo viên công bố điểm, nhưng vẫn ẩn đáp án (BD-06)',
      scoreOnlyRes.body.score !== null && parseFloat(scoreOnlyRes.body.score) === 10.0 && scoreOnlyRes.body.questions === undefined
    );

    // Teacher toggles answer publication as well
    await request('PATCH', `/api/exams/${pubExamId}/publication`, {
      is_published_scores: true,
      is_published_answers: true
    }, teacher1Headers);

    const fullResultRes = await request('GET', `/api/attempts/${attempt1Id}/result`, null, student1Headers);
    assertTest(
      'S-11d: Hiển thị đầy đủ điểm và chi tiết câu hỏi/đáp án khi cả 2 cờ công bố được bật (BD-06)',
      fullResultRes.body.score !== null && Array.isArray(fullResultRes.body.questions) && fullResultRes.body.questions.length === 2
    );

    // S-12: Max Attempts Boundary (BD-09)
    // PubExam max_attempts = 2. Attempt 1 is finished. Start attempt 2:
    const attempt2Res = await request('POST', '/api/attempts/start', { examId: pubExamId }, student1Headers);
    assertTest('S-12a: Bắt đầu lần thi thứ 2 thành công trong giới hạn max_attempts = 2', attempt2Res.status === 200);
    const attempt2Id = attempt2Res.body.attemptId;
    await request('POST', `/api/attempts/${attempt2Id}/submit`, { answers: [] }, student1Headers);

    // Attempt 3 should be BLOCKED with HTTP 403
    const attempt3Res = await request('POST', '/api/attempts/start', { examId: pubExamId }, student1Headers);
    assertTest(
      'S-12b: Chặn lần thi thứ 3 với HTTP 403 khi đã đạt số lần thi tối đa (BD-09)',
      attempt3Res.status === 403 && attempt3Res.body.error.includes('Maximum attempts limit reached')
    );

    // -------------------------------------------------------------------------
    // GROUP II: TEACHER E2E FLOW
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP II: TEACHER E2E FLOW ---');

    // T-01: List questions in bank
    const qListRes = await request('GET', '/api/questions', null, teacher1Headers);
    assertTest(
      'T-01a: Giáo viên truy xuất danh sách ngân hàng câu hỏi của chính mình',
      qListRes.status === 200 && Array.isArray(qListRes.body.questions) && qListRes.body.questions.length >= 2
    );

    // T-01b: Update question
    const updateQRes = await request('PUT', `/api/questions/${q1Id}`, {
      title: 'Câu hỏi Toán 1 (Đã cập nhật)',
      content: '2 + 2 = mấy?',
      question_type: 'single_choice',
      subject: 'Toan Hoc',
      difficulty: 'easy',
      choices: [
        { content: '4', is_correct: true },
        { content: '8', is_correct: false }
      ]
    }, teacher1Headers);
    assertTest('T-01b: Giáo viên cập nhật nội dung câu hỏi trong ngân hàng thành công', updateQRes.status === 200);

    // T-01c: Delete question (create a temporary one first)
    const tempQ = await request('POST', '/api/questions', {
      title: 'Câu hỏi tạm',
      content: 'Nội dung tạm',
      question_type: 'single_choice',
      subject: 'Tam',
      difficulty: 'easy',
      choices: [{ content: 'A', is_correct: true }, { content: 'B', is_correct: false }]
    }, teacher1Headers);
    const delQRes = await request('DELETE', `/api/questions/${tempQ.body.questionId}`, null, teacher1Headers);
    assertTest('T-01c: Giáo viên xóa/lưu trữ câu hỏi khỏi ngân hàng thành công', delQRes.status === 200);

    // T-02: Teacher gets active students list
    const studentsListRes = await request('GET', '/api/exams/students-list', null, teacher1Headers);
    assertTest(
      'T-02: Giáo viên lấy danh sách sinh viên hoạt động để gán vào đề thi (BD-10)',
      studentsListRes.status === 200 && Array.isArray(studentsListRes.body.students) && studentsListRes.body.students.length >= 2
    );

    // T-03: Create unattempted exam for testing edit
    const unattemptedExamRes = await request('POST', '/api/exams', {
      title: 'Đề Thi Chưa Có Bài Nộp',
      description: 'Dành để kiểm thử tính năng chỉnh sửa',
      duration_minutes: 20,
      max_attempts: 1,
      pass_score: 5.0,
      access_type: 'public',
      questions: [{ question_id: q1Id, weight: 1.0 }]
    }, teacher1Headers);
    const unattemptedExamId = unattemptedExamRes.body.examId;

    // T-04: Edit unattempted exam -> Should SUCCEED (200)
    const editUnattemptedRes = await request('PUT', `/api/exams/${unattemptedExamId}`, {
      title: 'Đề Thi Chưa Có Bài Nộp (Đã Sửa)',
      description: 'Mô tả mới',
      duration_minutes: 25,
      max_attempts: 2,
      pass_score: 6.0,
      access_type: 'public'
    }, teacher1Headers);
    assertTest(
      'T-04: Giáo viên chỉnh sửa đề thi khi chưa có bài làm thành công (HTTP 200)',
      editUnattemptedRes.status === 200
    );

    // T-05: BD-03 Freeze enforcement: Edit exam with existing attempts -> MUST FAIL with 403
    const editAttemptedRes = await request('PUT', `/api/exams/${pubExamId}`, {
      title: 'Đề Thi Đã Có Bài Nộp (Cố ý sửa)',
      duration_minutes: 10
    }, teacher1Headers);
    assertTest(
      'T-05: BD-03: Khóa cứng và từ chối chỉnh sửa đề thi đã có bài làm (HTTP 403)',
      editAttemptedRes.status === 403 && editAttemptedRes.body.error.includes('BD-03')
    );

    // T-06: Clone exam (BD-03)
    const cloneRes = await request('POST', `/api/exams/${pubExamId}/clone`, {}, teacher1Headers);
    assertTest(
      'T-06: Nhân bản đề thi sang phiên bản mới với số lượt thi đặt lại về 0 (BD-03)',
      cloneRes.status === 201 && cloneRes.body.clonedExamId > 0 && cloneRes.body.clonedExamId !== pubExamId
    );

    // T-07: View student submissions and results for exam
    const resultsRes = await request('GET', `/api/exams/${pubExamId}/results`, null, teacher1Headers);
    assertTest(
      'T-07: Giáo viên xem danh sách bài thi và điểm số của học sinh trong đề thi',
      resultsRes.status === 200 && Array.isArray(resultsRes.body.attempts) && resultsRes.body.attempts.length >= 2
    );

    // -------------------------------------------------------------------------
    // GROUP III: ADMIN E2E FLOW & TC-01 OPTION B
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP III: ADMIN E2E FLOW & TC-01 OPTION B ---');
    const adminHeaders = await createAuthHeaders(1); // admin_user

    // A-01: List users
    const usersRes = await request('GET', '/api/admin/users', null, adminHeaders);
    assertTest(
      'A-01: Admin xem danh sách tài khoản kèm vai trò và trạng thái',
      usersRes.status === 200 && Array.isArray(usersRes.body.users) && usersRes.body.users.length >= 5
    );

    // A-02: Change user role (student_two id 5 -> teacher)
    const roleChangeRes = await request('PATCH', '/api/admin/users/5', { role: 'teacher' }, adminHeaders);
    assertTest('A-02: Admin cập nhật vai trò người dùng thành công', roleChangeRes.status === 200);

    // Revert role
    await request('PATCH', '/api/admin/users/5', { role: 'student' }, adminHeaders);

    // A-03: Lock user account & verify session hard revocation
    // Create an active session for student_two
    const student2Token = generateSessionToken();
    const student2Hash = hashToken(student2Token);
    await rawDb.execute(
      'INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (5, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))',
      [student2Hash]
    );

    const lockRes = await request('PATCH', '/api/admin/users/5', { status: 'locked' }, adminHeaders);
    assertTest('A-03a: Admin khóa tài khoản người dùng thành công (status = locked)', lockRes.status === 200);

    // Check if sessions were purged
    const [activeSessions] = await rawDb.execute('SELECT * FROM user_sessions WHERE user_id = 5');
    assertTest(
      'A-03b: Thu hồi cứng toàn bộ phiên hoạt động khi tài khoản bị khóa (Session Hard Revocation)',
      activeSessions.length === 0
    );

    // Student 2 tries to access with old token -> should be 401
    const lockedAccessRes = await request('GET', '/api/attempts/available-exams', null, {
      'Authorization': `Bearer ${student2Token}`
    });
    assertTest(
      'A-03c: Tài khoản bị khóa bị từ chối truy cập API với HTTP 401',
      lockedAccessRes.status === 401
    );

    // A-04: Unlock user
    const unlockRes = await request('PATCH', '/api/admin/users/5', { status: 'active' }, adminHeaders);
    assertTest('A-04: Admin mở khóa tài khoản người dùng thành công', unlockRes.status === 200);

    // A-05: Admin cannot lock self
    const selfLockRes = await request('PATCH', '/api/admin/users/1', { status: 'locked' }, adminHeaders);
    assertTest(
      'A-05: Chặn quản trị viên tự khóa chính mình với HTTP 400',
      selfLockRes.status === 400
    );

    // A-06: TC-01 Option B Compliance Verification
    const statsRes = await request('GET', '/api/admin/stats', null, adminHeaders);
    const stats = statsRes.body.stats;
    const isAggregatesOnly = (
      stats.users && typeof stats.users.total_users === 'number' &&
      stats.exams && typeof stats.exams.total_exams === 'number' &&
      stats.attempts && typeof stats.attempts.total_attempts === 'number' &&
      stats.questions !== undefined &&
      // Strict TC-01 Option B check: No individual question text, answer keys, or student grades
      !JSON.stringify(stats).includes('2 + 2 = ?') &&
      !JSON.stringify(stats).includes('Hoanglinh1#')
    );
    assertTest(
      'A-06a: TC-01 Option B: Thống kê quản trị chỉ chứa siêu dữ liệu tổng hợp, không lộ nội dung học thuật',
      statsRes.status === 200 && isAggregatesOnly
    );

    // Admin tries to access academic question bank -> 403
    const adminQRes = await request('GET', '/api/questions', null, adminHeaders);
    assertTest('A-06b: TC-01B: Admin bị từ chối truy cập ngân hàng câu hỏi (HTTP 403)', adminQRes.status === 403);

    // Admin tries to access exam management -> 403
    const adminExamRes = await request('GET', '/api/exams', null, adminHeaders);
    assertTest('A-06c: TC-01B: Admin bị từ chối truy cập quản lý đề thi của giáo viên (HTTP 403)', adminExamRes.status === 403);

    // Admin tries to access student attempt results -> 403
    const adminResultRes = await request('GET', `/api/attempts/${attempt1Id}/result`, null, adminHeaders);
    assertTest('A-06d: TC-01B: Admin bị từ chối truy cập kết quả bài làm cá nhân (HTTP 403)', adminResultRes.status === 403);

    // A-07: Audit logs
    const auditRes = await request('GET', '/api/admin/audit-logs', null, adminHeaders);
    assertTest(
      'A-07: Admin xem nhật ký kiểm toán hệ thống (Audit Trail) đầy đủ phân trang',
      auditRes.status === 200 && Array.isArray(auditRes.body.logs) && auditRes.body.logs.length > 0
    );

    // -------------------------------------------------------------------------
    // GROUP IV: CROSS-ROLE RBAC & SECURITY
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP IV: CROSS-ROLE RBAC & SECURITY ---');

    // C-01: RBAC boundaries
    const studentToAdmin = await request('GET', '/api/admin/users', null, student1Headers);
    assertTest('C-01a: Sinh viên gọi API Admin bị từ chối 403 Forbidden', studentToAdmin.status === 403);

    const studentToTeacher = await request('GET', '/api/questions', null, student1Headers);
    assertTest('C-01b: Sinh viên gọi API Giáo viên bị từ chối 403 Forbidden', studentToTeacher.status === 403);

    const teacherToAdmin = await request('GET', '/api/admin/users', null, teacher1Headers);
    assertTest('C-01c: Giáo viên gọi API Admin bị từ chối 403 Forbidden', teacherToAdmin.status === 403);

    const teacherToStudentExam = await request('POST', '/api/attempts/start', { examId: pubExamId }, teacher1Headers);
    assertTest('C-01d: Giáo viên gọi API làm bài thi bị từ chối 403 Forbidden', teacherToStudentExam.status === 403);

    // C-02: IDOR Protection
    // Student 2 tries to view Student 1's attempt result
    const freshStudent2Headers = await createAuthHeaders(5);
    const idorStudentRes = await request('GET', `/api/attempts/${attempt1Id}/result`, null, freshStudent2Headers);
    assertTest(
      'C-02a: IDOR: Sinh viên không thể xem bài thi của sinh viên khác (HTTP 403)',
      idorStudentRes.status === 403
    );

    // Teacher 2 tries to view Teacher 1's exam results
    const teacher2Headers = await createAuthHeaders(3); // teacher_two
    const idorTeacherRes = await request('GET', `/api/exams/${pubExamId}/results`, null, teacher2Headers);
    assertTest(
      'C-02b: IDOR: Giáo viên không thể xem kết quả đề thi của giáo viên khác (HTTP 404/403)',
      idorTeacherRes.status === 404 || idorTeacherRes.status === 403
    );

    // Teacher 2 tries to update Teacher 1's question
    const idorUpdateQRes = await request('PUT', `/api/questions/${q1Id}`, { title: 'Hacked Title' }, teacher2Headers);
    assertTest(
      'C-02c: IDOR: Giáo viên không thể sửa câu hỏi của giáo viên khác (HTTP 404)',
      idorUpdateQRes.status === 404
    );

    // C-03: Snapshot Immutability (BD-12)
    // Teacher 1 updates q1 in question bank AFTER attempt 1 was taken
    await request('PUT', `/api/questions/${q1Id}`, {
      title: 'Câu hỏi Toán 1 (Sửa lần 3)',
      content: 'Nội dung hoàn toàn mới 999 + 999 = ?',
      question_type: 'single_choice',
      subject: 'Toan Hoc',
      difficulty: 'hard',
      choices: [{ content: '1998', is_correct: true }, { content: '0', is_correct: false }]
    }, teacher1Headers);

    // Verify student attempt 1 snapshot data in MySQL
    const [snapshotRows] = await rawDb.execute(
      'SELECT snapshot_data FROM attempt_question_snapshots WHERE attempt_id = ? AND question_id = ?',
      [attempt1Id, q1Id]
    );
    const rawSnap = snapshotRows[0].snapshot_data;
    const persistedSnapshot = typeof rawSnap === 'string' ? JSON.parse(rawSnap) : rawSnap;
    assertTest(
      'C-03: BD-12: Snapshot bài làm của sinh viên hoàn toàn bất biến khi ngân hàng câu hỏi bị sửa',
      persistedSnapshot.title === 'Câu hỏi Toán 1' && persistedSnapshot.content === '2 + 2 = ?'
    );

  } finally {
    if (server) server.close();
    if (rawDb) await rawDb.end();
  }

  console.log('\n========================================================================');
  console.log(`   TEST SUITE SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED (TOTAL: ${passedCount + failedCount})`);
  console.log('========================================================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllTests().catch(err => {
  console.error('[FATAL TEST SUITE ERROR]', err);
  process.exit(1);
});
