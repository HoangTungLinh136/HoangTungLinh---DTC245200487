const db = require('../config/db');
const attemptRepo = require('../repositories/attemptRepository');
const examRepo = require('../repositories/examRepository');
const questionRepo = require('../repositories/questionRepository');
const auditRepo = require('../repositories/auditRepository');
const receiptRepo = require('../repositories/receiptRepository');
const { gradeAttempt } = require('../services/scoringService');
const { activeAttemptsGauge } = require('../config/metrics');

/**
 * List exams available for student (Public + Assigned) - BD-10
 */
async function listAvailableExams(req, res) {
  try {
    const studentId = req.user.id;
    const exams = await examRepo.listAvailableForStudent(studentId);
    return res.json({ exams });
  } catch (error) {
    console.error('[AttemptController.listAvailableExams] Error:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve available exams' });
  }
}

/**
 * List student's own attempts history
 */
async function listStudentAttempts(req, res) {
  try {
    const studentId = req.user.id;
    const attempts = await attemptRepo.listStudentAttempts(studentId);
    return res.json({ attempts });
  } catch (error) {
    console.error('[AttemptController.listStudentAttempts] Error:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve attempt history' });
  }
}

/**
 * Start or resume exam attempt (BD-09, BD-12, Deadline Option A)
 * Enforces: at most 1 active attempt per student, max_attempts boundary, atomic snapshot
 */
async function startOrResumeAttempt(req, res) {
  const connection = await db.getConnection();
  try {
    const studentId = req.user.id;
    const examId = parseInt(req.body.examId, 10);

    if (!examId) {
      return res.status(400).json({ error: 'examId is required' });
    }

    await connection.beginTransaction();

    // 1. Fetch exam with row lock
    const exam = await examRepo.findByIdForUpdate(examId, connection);
    if (!exam || exam.status !== 'published') {
      await connection.rollback();
      return res.status(404).json({ error: 'Exam not available or inactive' });
    }

    // Check assignment eligibility if assigned (BD-10)
    if (exam.access_type === 'assigned') {
      const isAssigned = await examRepo.isStudentAssigned(examId, studentId, connection);
      if (!isAssigned) {
        await connection.rollback();
        return res.status(403).json({ error: 'You are not assigned to this exam' });
      }
    }

    // 2. Check for active in_progress attempt (BD-09 Resume)
    let active = await attemptRepo.findActiveAttempt(studentId, examId, connection);

    let attemptId;
    let deadlineAt;
    let startedAt;
    let attemptNumber;

    if (active) {
      // Resume active attempt
      attemptId = active.id;
      deadlineAt = active.deadline_at;
      startedAt = active.started_at;
      attemptNumber = active.attempt_number;

      // Verify if deadline has expired
      if (new Date(deadlineAt) <= new Date()) {
        await attemptRepo.updateStatus(attemptId, 'expired', null, connection);
        await connection.commit();
        await gradeAttempt(attemptId, 'expiry_worker');
        return res.status(400).json({ error: 'Your active attempt has expired' });
      }
    } else {
      // 3. Check attempt limit (BD-09, 0 = unlimited)
      const taken = await attemptRepo.countAttempts(studentId, examId, connection);
      if (exam.max_attempts > 0 && taken >= exam.max_attempts) {
        await connection.rollback();
        return res.status(403).json({
          error: `Maximum attempts limit reached (${taken}/${exam.max_attempts})`
        });
      }

      attemptNumber = taken + 1;

      // 4. Calculate Authoritative Deadline: D = min(now + duration, exam.end_time) (Deadline Option A)
      const now = new Date();
      const calculatedEnd = new Date(now.getTime() + exam.duration_minutes * 60 * 1000);
      let authoritativeDeadline = calculatedEnd;

      if (exam.end_time) {
        const examEndTime = new Date(exam.end_time);
        if (examEndTime < calculatedEnd) {
          authoritativeDeadline = examEndTime;
        }
      }

      startedAt = now;
      deadlineAt = authoritativeDeadline;

      // Insert new attempt with virtual token unique constraint (BD-09)
      try {
        attemptId = await attemptRepo.createAttempt(examId, studentId, attemptNumber, startedAt, deadlineAt, connection);
      } catch (insertErr) {
        // Handle ER_DUP_ENTRY in case of simultaneous concurrent start request
        if (insertErr.code === 'ER_DUP_ENTRY') {
          active = await attemptRepo.findActiveAttempt(studentId, examId, connection);
          if (active) {
            attemptId = active.id;
            deadlineAt = active.deadline_at;
            startedAt = active.started_at;
            attemptNumber = active.attempt_number;
          } else {
            throw insertErr;
          }
        } else {
          throw insertErr;
        }
      }

      // 5. Create immutable snapshot of questions and choices (BD-12 Atomic Batch)
      if (!active) {
        const examQuestions = await examRepo.getExamQuestions(examId, connection);

        for (const eq of examQuestions) {
          const choices = await questionRepo.getChoicesByQuestionId(eq.question_id, connection);

          const snapshotData = {
            question_id: eq.question_id,
            title: eq.title,
            content: eq.content,
            question_type: eq.question_type,
            subject: eq.subject,
            difficulty: eq.difficulty,
            choices: choices.map(c => ({
              id: c.id,
              content: c.content,
              is_correct: c.is_correct === 1,
              sort_order: c.sort_order
            }))
          };

          await attemptRepo.saveSnapshot(
            attemptId,
            eq.question_id,
            eq.question_order,
            eq.question_type,
            eq.weight,
            snapshotData,
            connection
          );
        }

        activeAttemptsGauge.inc();
        await auditRepo.log(studentId, 'START_ATTEMPT', 'ATTEMPT', attemptId, { examId, attemptNumber }, req.ip, connection);
      }
    }

    await connection.commit();

    // 6. Return sanitized question payload (omit is_correct keys)
    const snapshots = await attemptRepo.getSnapshots(attemptId);
    const questions = snapshots.map(s => {
      const data = typeof s.snapshot_data === 'string' ? JSON.parse(s.snapshot_data) : s.snapshot_data;
      return {
        question_id: s.question_id,
        question_order: s.question_order,
        question_type: s.question_type,
        weight: s.weight,
        title: data.title,
        content: data.content,
        choices: (data.choices || []).map(c => ({
          id: c.id,
          content: c.content,
          sort_order: c.sort_order
        }))
      };
    });

    // Fetch any saved draft answers
    const draftAnswers = await attemptRepo.getDraftAnswers(attemptId);
    const answers = draftAnswers.map(a => ({
      question_id: a.question_id,
      selected_choice_ids: typeof a.selected_choice_ids === 'string'
        ? JSON.parse(a.selected_choice_ids)
        : a.selected_choice_ids,
      revision: a.revision
    }));

    return res.json({
      attemptId,
      examId,
      examTitle: exam.title,
      attemptNumber,
      startedAt,
      deadlineAt,
      serverTime: new Date().toISOString(),
      questions,
      answers
    });
  } catch (error) {
    await connection.rollback();
    console.error('[AttemptController.startOrResumeAttempt] Error:', error.message);
    return res.status(500).json({ error: 'Failed to start or resume attempt' });
  } finally {
    connection.release();
  }
}

/**
 * Ingress FIFO Queue per attempt (R8 C-ORDER Ingress Serialization)
 * Establishes server-authoritative receive order before asynchronous DB waits.
 * Guarantees that if SAVE is received before SUBMIT, SAVE commits to MySQL
 * before SUBMIT begins, preventing DB connection pool race from inverting order.
 *
 * Invariants:
 * 1. FIFO ordering per attemptId: task N+1 waits for task N to finish.
 * 2. Fault isolation: if task N throws/rejects, task N+1 still executes normally.
 * 3. Zero memory leak: when queueTail settles and no new task arrived, Map entry is deleted.
 * 4. Concurrency: different attemptIds execute completely independently in parallel.
 */
const attemptQueues = new Map();

// Test-only dependency injection hook (never exposed via HTTP headers)
let testConnectionDelayHook = null;

function enqueueAttemptOperation(attemptId, task) {
  const previousTail = attemptQueues.get(attemptId) || Promise.resolve();

  let resolveResult, rejectResult;
  const resultPromise = new Promise((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const executionPromise = previousTail.then(async () => {
    try {
      const res = await task();
      resolveResult(res);
    } catch (err) {
      rejectResult(err);
    }
  });

  // Create queue tail that ALWAYS resolves (handling both fulfillment and rejection)
  // This prevents unhandled rejections and ensures failure of task N does NOT break task N+1
  const queueTail = executionPromise.then(
    () => {},
    () => {}
  );

  // Store the EXACT queueTail promise in the map
  attemptQueues.set(attemptId, queueTail);

  // Clean up Map entry when queueTail finishes: compare identity directly against queueTail
  queueTail.then(() => {
    if (attemptQueues.get(attemptId) === queueTail) {
      attemptQueues.delete(attemptId);
    }
  });

  return resultPromise;
}

/**
 * Save draft answer for one or multiple questions (BD-05, R8-D09/10, R2-01)
 * Idempotent with request_id + digest check via receiptRepository
 */
async function saveDraft(req, res) {
  const attemptId = parseInt(req.params.id, 10);
  if (!attemptId || isNaN(attemptId)) {
    return res.status(400).json({ error: 'Invalid attempt ID' });
  }

  return enqueueAttemptOperation(attemptId, async () => {
    // Test-only dependency injection hook (never reads client HTTP headers)
    if (typeof testConnectionDelayHook === 'function') {
      await testConnectionDelayHook(attemptId, req);
    }

    let connection = null;
    const studentId = req.user.id;
    const { answers } = req.body || {};
    const requestId = req.headers['x-request-id'] || req.body?.requestId || null;
    let digest = null;

    try {
      if (!answers || !Array.isArray(answers)) {
        return res.status(400).json({ error: 'answers array is required' });
      }

      connection = await db.getConnection();
      await connection.beginTransaction();

      const effectiveRequestId = requestId || ('srv_draft_' + attemptId + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9));
      digest = receiptRepo.computeDigest(answers);

      // Idempotency check if requestId is provided (R2-01)
      if (requestId) {
        const existingReceipt = await receiptRepo.findByRequestKeyForUpdate(studentId, attemptId, requestId, connection);
        if (existingReceipt) {
          if (existingReceipt.digest === digest) {
            await connection.rollback().catch(() => {});
            return res.status(200).json(existingReceipt.response_body);
          } else {
            await connection.rollback().catch(() => {});
            return res.status(409).json({
              error: 'Duplicate request_id with conflicting payload digest',
              requestId
            });
          }
        }
      }

      // Verify attempt ownership and deadline with lock
      const attempt = await attemptRepo.findByIdForUpdate(attemptId, connection);
      if (!attempt || attempt.student_id !== studentId) {
        await connection.rollback().catch(() => {});
        return res.status(404).json({ error: 'Attempt not found or unauthorized' });
      }

      // SAVE/SUBMIT Ordering check: If attempt is no longer in_progress, reject with 409
      if (attempt.status !== 'in_progress') {
        await connection.rollback().catch(() => {});
        return res.status(409).json({ error: `Cannot save answers. Attempt status is '${attempt.status}'` });
      }

      const now = new Date();
      if (new Date(attempt.deadline_at) < now) {
        await connection.rollback().catch(() => {});
        return res.status(400).json({ error: 'Exam deadline has passed. Answers cannot be saved.' });
      }

      // Validate that all question_ids belong to this attempt's snapshot (R8-D10 Batch conflict check)
      const snapshots = await attemptRepo.getSnapshots(attemptId, connection);
      const validQuestionIds = new Set(snapshots.map(s => s.question_id));

      for (const ans of answers) {
        if (!validQuestionIds.has(ans.question_id)) {
          await connection.rollback().catch(() => {});
          return res.status(400).json({ error: `Question ID ${ans.question_id} does not belong to this exam attempt` });
        }
      }

      // Save each draft atomically
      for (const ans of answers) {
        const choiceIdsJson = JSON.stringify(ans.selected_choice_ids || []);
        const clientRev = ans.revision !== undefined ? ans.revision : (ans.client_revision !== undefined ? ans.client_revision : null);
        await attemptRepo.saveDraftAnswer(attemptId, ans.question_id, choiceIdsJson, clientRev, connection);
      }

      const responsePayload = {
        success: true,
        serverTime: new Date().toISOString(),
        savedCount: answers.length
      };

      try {
        await receiptRepo.recordReceipt({
          attemptId,
          actorId: studentId,
          requestId: effectiveRequestId,
          operation: 'SAVE_DRAFT',
          digest,
          outcomeStatus: 'COMMITTED',
          responseBody: responsePayload
        }, connection);
      } catch (recErr) {
        if (recErr.code === 'ER_DUP_ENTRY' && requestId) {
          const existing = await receiptRepo.findByRequestKey(studentId, attemptId, requestId);
          if (existing) {
            await connection.rollback().catch(() => {});
            if (existing.digest === digest) {
              return res.status(200).json(existing.response_body);
            } else {
              return res.status(409).json({
                error: 'Duplicate request_id with conflicting payload digest',
                requestId
              });
            }
          }
        }
        throw recErr;
      }

      await connection.commit();
      return res.json(responsePayload);
    } catch (error) {
      if (connection) {
        await connection.rollback().catch(() => {});
      }
      if ((error.code === 'ER_LOCK_DEADLOCK' || error.errno === 1213 || error.code === 'ER_LOCK_WAIT_TIMEOUT') && requestId) {
        for (let attempt = 0; attempt < 5; attempt++) {
          await new Promise(r => setTimeout(r, 80));
          const existing = await receiptRepo.findByRequestKey(studentId, attemptId, requestId);
          if (existing) {
            if (existing.digest === digest) {
              return res.status(200).json(existing.response_body);
            } else {
              return res.status(409).json({
                error: 'Duplicate request_id with conflicting payload digest',
                requestId
              });
            }
          }
        }
      }
      console.error('[AttemptController.saveDraft] Error:', error.message);
      return res.status(500).json({ error: 'Failed to save draft answers' });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });
}

/**
 * Submit exam attempt (BD-07, BD-13, R8-D09, R2-01)
 * Idempotent with request_id + digest check via receiptRepository
 */
async function submitAttempt(req, res) {
  const attemptId = parseInt(req.params.id, 10);
  if (!attemptId || isNaN(attemptId)) {
    return res.status(400).json({ error: 'Invalid attempt ID' });
  }

  return enqueueAttemptOperation(attemptId, async () => {
    let connection = null;
    const studentId = req.user.id;
    const { answers } = req.body || {};
    const requestId = req.headers['x-request-id'] || req.body?.requestId || null;
    let digest = null;

    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      const effectiveRequestId = requestId || ('srv_submit_' + attemptId + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9));
      digest = receiptRepo.computeDigest({ answers: answers || [] });

      // Idempotency check if requestId is provided (R2-01)
      if (requestId) {
        const existingReceipt = await receiptRepo.findByRequestKeyForUpdate(studentId, attemptId, requestId, connection);
        if (existingReceipt) {
          if (existingReceipt.digest === digest) {
            await connection.rollback().catch(() => {});
            return res.status(200).json(existingReceipt.response_body);
          } else {
            await connection.rollback().catch(() => {});
            return res.status(409).json({
              error: 'Duplicate request_id with conflicting payload digest',
              requestId
            });
          }
        }
      }

      // Lock attempt row
      const attempt = await attemptRepo.findByIdForUpdate(attemptId, connection);
      if (!attempt || attempt.student_id !== studentId) {
        await connection.rollback().catch(() => {});
        return res.status(404).json({ error: 'Attempt not found or unauthorized' });
      }

      // SAVE/SUBMIT Ordering: If already completed or expired, return 409 Conflict
      if (attempt.status !== 'in_progress') {
        await connection.rollback().catch(() => {});
        return res.status(409).json({
          error: 'Attempt has already been finalized',
          status: attempt.status,
          attemptId
        });
      }

      // Validate and save final batch if provided
      if (answers && Array.isArray(answers)) {
        const snapshots = await attemptRepo.getSnapshots(attemptId, connection);
        const validQuestionIds = new Set(snapshots.map(s => s.question_id));

        for (const ans of answers) {
          if (!validQuestionIds.has(ans.question_id)) {
            await connection.rollback().catch(() => {});
            return res.status(400).json({ error: `Question ID ${ans.question_id} does not belong to this exam attempt` });
          }
        }

        for (const ans of answers) {
          const choiceIdsJson = JSON.stringify(ans.selected_choice_ids || []);
          const clientRev = ans.revision !== undefined ? ans.revision : (ans.client_revision !== undefined ? ans.client_revision : null);
          await attemptRepo.saveDraftAnswer(attemptId, ans.question_id, choiceIdsJson, clientRev, connection);
        }
      }

      const now = new Date();
      const finalStatus = (now > new Date(attempt.deadline_at)) ? 'expired' : 'completed';

      await attemptRepo.updateStatus(attemptId, finalStatus, now, connection);

      const responsePayload = {
        message: 'Exam submitted successfully',
        attemptId,
        status: finalStatus
      };

      try {
        await receiptRepo.recordReceipt({
          attemptId,
          actorId: studentId,
          requestId: effectiveRequestId,
          operation: 'SUBMIT_ATTEMPT',
          digest,
          outcomeStatus: 'COMMITTED',
          responseBody: responsePayload
        }, connection);
      } catch (recErr) {
        if (recErr.code === 'ER_DUP_ENTRY' && requestId) {
          const existing = await receiptRepo.findByRequestKey(studentId, attemptId, requestId);
          if (existing) {
            await connection.rollback().catch(() => {});
            if (existing.digest === digest) {
              return res.status(200).json(existing.response_body);
            } else {
              return res.status(409).json({
                error: 'Duplicate request_id with conflicting payload digest',
                requestId
              });
            }
          }
        }
        throw recErr;
      }

      await connection.commit();

      // Trigger grading
      const gradeResult = await gradeAttempt(attemptId, 'submit');

      await auditRepo.log(studentId, 'SUBMIT_ATTEMPT', 'ATTEMPT', attemptId, { finalStatus, gradeResult }, req.ip);

      return res.json(responsePayload);
    } catch (error) {
      if (connection) {
        await connection.rollback().catch(() => {});
      }
      if ((error.code === 'ER_LOCK_DEADLOCK' || error.errno === 1213 || error.code === 'ER_LOCK_WAIT_TIMEOUT') && requestId) {
        for (let attempt = 0; attempt < 5; attempt++) {
          await new Promise(r => setTimeout(r, 80));
          const existing = await receiptRepo.findByRequestKey(studentId, attemptId, requestId);
          if (existing) {
            if (existing.digest === digest) {
              return res.status(200).json(existing.response_body);
            } else {
              return res.status(409).json({
                error: 'Duplicate request_id with conflicting payload digest',
                requestId
              });
            }
          }
        }
      }
      console.error('[AttemptController.submitAttempt] Error:', error.message);
      return res.status(500).json({ error: 'Failed to submit exam attempt' });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });
}

/**
 * Get attempt result with strict publication projection (BD-06, IA01-F10)
 */
async function getAttemptResult(req, res) {
  try {
    const attemptId = parseInt(req.params.id, 10);
    const userId = req.user.id;
    const userRole = req.user.role;

    const att = await attemptRepo.getAttemptWithExamMeta(attemptId);
    if (!att) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    // Strict Authorization: Student can only view their own attempt, Teacher only their own exam
    if (userRole === 'student' && att.student_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized to view this attempt result' });
    }
    if (userRole === 'teacher' && att.teacher_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized to view this attempt result' });
    }

    const isTeacher = userRole === 'teacher';
    const showScore = isTeacher || att.is_published_scores === 1;
    const showAnswers = isTeacher || att.is_published_answers === 1;

    const responseData = {
      attemptId: att.id,
      examId: att.exam_id,
      examTitle: att.exam_title,
      studentName: att.student_name,
      attemptNumber: att.attempt_number,
      status: att.status,
      startedAt: att.started_at,
      submittedAt: att.submitted_at,
      passScore: att.pass_score,
      isPublishedScores: att.is_published_scores === 1,
      isPublishedAnswers: att.is_published_answers === 1,
      score: showScore ? att.score : null,
      rawScore: showScore ? att.raw_score : null,
      scoreMessage: showScore ? null : 'Điểm thi chưa được giáo viên công bố.',
      answersMessage: showAnswers ? null : 'Đáp án chi tiết chưa được giáo viên công bố.'
    };

    if (showAnswers) {
      const [snapshots] = await db.execute(
        `SELECT s.question_id, s.question_order, s.question_type, s.weight, s.snapshot_data,
                ans.selected_choice_ids, ans.is_correct, ans.score_awarded
         FROM attempt_question_snapshots s
         LEFT JOIN attempt_answers ans ON s.attempt_id = ans.attempt_id AND s.question_id = ans.question_id
         WHERE s.attempt_id = ?
         ORDER BY s.question_order ASC`,
        [attemptId]
      );

      responseData.questions = snapshots.map(s => {
        const data = typeof s.snapshot_data === 'string' ? JSON.parse(s.snapshot_data) : s.snapshot_data;
        let selectedChoices = [];
        try {
          selectedChoices = typeof s.selected_choice_ids === 'string'
            ? JSON.parse(s.selected_choice_ids)
            : (s.selected_choice_ids || []);
        } catch (e) {
          selectedChoices = [];
        }

        return {
          question_id: s.question_id,
          questionId: s.question_id,
          question_order: s.question_order,
          questionOrder: s.question_order,
          question_type: s.question_type,
          questionType: s.question_type,
          weight: s.weight,
          title: data.title,
          content: data.content,
          is_correct: s.is_correct === 1,
          isCorrect: s.is_correct === 1,
          score_awarded: s.score_awarded,
          scoreAwarded: s.score_awarded,
          selected_choice_ids: selectedChoices,
          selectedChoiceIds: selectedChoices,
          choices: (data.choices || []).map(c => ({
            id: c.id,
            content: c.content,
            is_correct: c.is_correct === true || c.is_correct === 1,
            isCorrect: c.is_correct === true || c.is_correct === 1,
            sort_order: c.sort_order,
            sortOrder: c.sort_order
          }))
        };
      });
    }

    return res.json({ result: responseData, ...responseData });
  } catch (error) {
    console.error('[AttemptController.getAttemptResult] Error:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve attempt result' });
  }
}

module.exports = {
  listAvailableExams,
  listStudentAttempts,
  startOrResumeAttempt,
  saveDraft,
  submitAttempt,
  getAttemptResult,
  // Exported for test verification & dependency injection
  enqueueAttemptOperation,
  _getQueueMap: () => attemptQueues,
  _setTestConnectionDelayHook: (fn) => { testConnectionDelayHook = fn; }
};
