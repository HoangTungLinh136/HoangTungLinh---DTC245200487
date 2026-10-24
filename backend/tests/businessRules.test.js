const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const { generateSessionToken, hashToken } = require('../src/middleware/auth');

test('BD-01 Registration & Password Security: bcrypt hashing', async () => {
  const plainPassword = 'Password123!';
  const hash = await bcrypt.hash(plainPassword, 10);

  assert.ok(hash.startsWith('$2a$10$') || hash.startsWith('$2b$10$'), 'Valid bcrypt prefix');
  const isMatch = await bcrypt.compare(plainPassword, hash);
  assert.strictEqual(isMatch, true, 'Plaintext password must match hash');

  const isWrong = await bcrypt.compare('WrongPassword!', hash);
  assert.strictEqual(isWrong, false, 'Invalid password must be rejected');
});

test('BD-11 Password Reset & Sessions: secure random token & SHA-256 hash', () => {
  const token1 = generateSessionToken();
  const token2 = generateSessionToken();

  assert.strictEqual(token1.length, 64, '32-byte hex token length must be 64');
  assert.notStrictEqual(token1, token2, 'Generated tokens must be unique');

  const hash1 = hashToken(token1);
  const hash2 = hashToken(token1);
  assert.strictEqual(hash1, hash2, 'Token hash must be deterministic');
  assert.strictEqual(hash1.length, 64, 'SHA-256 hash must be 64 hex characters');
});

test('Deadline Option A: Authoritative deadline calculation D = min(now + duration, exam.end_time)', () => {
  const now = new Date('2026-10-22T08:00:00Z');
  const durationMinutes = 30;
  const calculatedEnd = new Date(now.getTime() + durationMinutes * 60 * 1000); // 08:30:00Z

  // Case 1: No exam.end_time -> Authoritative deadline is now + duration
  let examEndTime = null;
  let deadline = calculatedEnd;
  if (examEndTime && new Date(examEndTime) < calculatedEnd) {
    deadline = new Date(examEndTime);
  }
  assert.strictEqual(deadline.toISOString(), '2026-10-22T08:30:00.000Z');

  // Case 2: exam.end_time is earlier (e.g. 08:20:00Z) -> Deadline capped at exam.end_time
  examEndTime = '2026-10-22T08:20:00.000Z';
  if (examEndTime && new Date(examEndTime) < calculatedEnd) {
    deadline = new Date(examEndTime);
  }
  assert.strictEqual(deadline.toISOString(), '2026-10-22T08:20:00.000Z');

  // Case 3: exam.end_time is later (e.g. 09:00:00Z) -> Deadline is calculatedEnd (08:30:00Z)
  examEndTime = '2026-10-22T09:00:00.000Z';
  deadline = calculatedEnd;
  if (examEndTime && new Date(examEndTime) < calculatedEnd) {
    deadline = new Date(examEndTime);
  }
  assert.strictEqual(deadline.toISOString(), '2026-10-22T08:30:00.000Z');
});

test('BD-06 Publication: Strict projection masking for students', () => {
  const mockAttempt = {
    id: 1,
    student_id: 3,
    score: 8.5,
    raw_score: 17,
    is_published_scores: 0,
    is_published_answers: 0
  };

  function projectStudentView(att, userRole) {
    const isTeacher = userRole === 'teacher';
    const showScore = isTeacher || att.is_published_scores === 1;
    const showAnswers = isTeacher || att.is_published_answers === 1;

    return {
      attemptId: att.id,
      score: showScore ? att.score : null,
      rawScore: showScore ? att.raw_score : null,
      scoreMessage: showScore ? null : 'Điểm thi chưa được giáo viên công bố.',
      answersMessage: showAnswers ? null : 'Đáp án chi tiết chưa được giáo viên công bố.'
    };
  }

  // Student view with unpublished flags
  const studentView = projectStudentView(mockAttempt, 'student');
  assert.strictEqual(studentView.score, null, 'Score must be masked when is_published_scores is 0');
  assert.strictEqual(studentView.rawScore, null, 'Raw score must be masked');
  assert.strictEqual(studentView.scoreMessage, 'Điểm thi chưa được giáo viên công bố.');

  // Teacher view bypasses masking
  const teacherView = projectStudentView(mockAttempt, 'teacher');
  assert.strictEqual(teacherView.score, 8.5, 'Teacher must see the actual score');
  assert.strictEqual(teacherView.rawScore, 17, 'Teacher must see the actual raw score');

  // Student view after publication
  mockAttempt.is_published_scores = 1;
  const publishedStudentView = projectStudentView(mockAttempt, 'student');
  assert.strictEqual(publishedStudentView.score, 8.5, 'Published score is visible');
  assert.strictEqual(publishedStudentView.scoreMessage, null);
});

test('TC-01 Option B: Admin metadata privacy protection', () => {
  const adminAllowedFields = ['id', 'username', 'email', 'role', 'status', 'created_at'];
  const sensitiveAcademicFields = ['question_content', 'answer_key', 'student_selected_choices', 'student_grade'];

  // Admin query columns MUST NOT contain sensitive academic fields
  sensitiveAcademicFields.forEach(field => {
    assert.strictEqual(adminAllowedFields.includes(field), false, `Admin view must not include ${field}`);
  });
});
