const db = require('../config/db');
const { attemptsCompletedTotal, activeAttemptsGauge } = require('../config/metrics');

/**
 * Deterministic integer-scaled rounding: floor((2000 * R + M) / (2 * M)) / 100
 * @param {number} rawScore 
 * @param {number} maxScore 
 * @returns {number} Normalized score out of 10.00
 */
function calculateNormalizedScore(rawScore, maxScore) {
  if (maxScore <= 0) return 0.00;
  const R = Math.round(rawScore * 100);
  const M = Math.round(maxScore * 100);
  if (M === 0) return 0.00;
  
  const scoreHundredths = Math.floor((2000 * R + M) / (2 * M));
  return scoreHundredths / 100;
}

/**
 * Phase 1: Claim grading lease with optimistic fencing token (IA01-F04, C-GRADE)
 * @param {number} attemptId 
 * @param {string} workerId 
 * @param {number} leaseSeconds 
 */
async function claimGradingJob(attemptId, workerId = 'worker-1', leaseSeconds = 30) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [attempts] = await connection.execute(
      `SELECT id, exam_id, student_id, status, grading_status, grading_fencing_token,
              grading_lease_expires_at, grading_retry_count, started_at, deadline_at
       FROM exam_attempts
       WHERE id = ? FOR UPDATE`,
      [attemptId]
    );

    if (attempts.length === 0) {
      await connection.rollback();
      return { eligible: false, reason: 'ATTEMPT_NOT_FOUND' };
    }

    const attempt = attempts[0];

    // 1. Idempotency check: Already graded
    if (attempt.grading_status === 'graded') {
      await connection.rollback();
      return { eligible: false, reason: 'ALREADY_GRADED', attemptId };
    }

    // 2. Retry budget check (Max 3 claims)
    const retryCount = attempt.grading_retry_count || 0;
    if (retryCount >= 3) {
      await connection.execute(
        `UPDATE exam_attempts SET grading_status = 'failed' WHERE id = ?`,
        [attemptId]
      );
      await connection.commit();
      return { eligible: false, reason: 'RETRY_BUDGET_EXHAUSTED', attemptId };
    }

    // 3. Active lease check
    const now = new Date();
    if (attempt.grading_status === 'grading') {
      const leaseExpires = attempt.grading_lease_expires_at ? new Date(attempt.grading_lease_expires_at) : null;
      if (leaseExpires && leaseExpires > now) {
        await connection.rollback();
        return { eligible: false, reason: 'LEASE_ACTIVE', attemptId, leaseExpiresAt: leaseExpires };
      }
    }

    // 4. Advance fencing token and acquire lease
    const newFencingToken = (attempt.grading_fencing_token || 0) + 1;
    const newRetryCount = retryCount + 1;
    const leaseExpiry = new Date(Date.now() + leaseSeconds * 1000);

    const [claimResult] = await connection.execute(
      `UPDATE exam_attempts
       SET grading_status = 'grading',
           grading_fencing_token = ?,
           grading_retry_count = ?,
           grading_lease_expires_at = ?
       WHERE id = ? AND grading_fencing_token = ?`,
      [newFencingToken, newRetryCount, leaseExpiry, attemptId, attempt.grading_fencing_token]
    );

    if (claimResult.affectedRows === 0) {
      await connection.rollback();
      return { eligible: false, reason: 'CONCURRENT_CLAIM_RACE' };
    }

    await connection.commit();

    return {
      eligible: true,
      attemptId,
      fencingToken: newFencingToken,
      retryCount: newRetryCount,
      leaseExpiresAt: leaseExpiry
    };
  } catch (error) {
    await connection.rollback();
    console.error(`[ScoringService.claimGradingJob] Error claiming attempt ${attemptId}:`, error.message);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Phase 2: Complete grading job with strict fencing token validation inside transaction (IA01-F04)
 * @param {number} attemptId 
 * @param {number} workerFencingToken 
 * @param {number} totalRawScore 
 * @param {number} maxRawScore 
 * @param {number} normalizedScore 
 */
async function completeGradingJob(attemptId, workerFencingToken, totalRawScore, maxRawScore, normalizedScore) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Lock attempt row and inspect current token
    const [attempts] = await connection.execute(
      `SELECT id, status, grading_status, grading_fencing_token, grading_lease_expires_at
       FROM exam_attempts
       WHERE id = ? FOR UPDATE`,
      [attemptId]
    );

    if (attempts.length === 0) {
      await connection.rollback();
      return { committed: false, reason: 'ATTEMPT_NOT_FOUND' };
    }

    const attempt = attempts[0];

    // FENCING VERIFICATION: Token comparison directly inside transaction
    if (attempt.grading_fencing_token !== workerFencingToken) {
      await connection.rollback();
      return {
        committed: false,
        reason: 'STALE_FENCING_TOKEN',
        expectedToken: attempt.grading_fencing_token,
        workerToken: workerFencingToken
      };
    }

    // Verify lease has not expired
    const now = new Date();
    if (attempt.grading_lease_expires_at && new Date(attempt.grading_lease_expires_at) < now) {
      await connection.rollback();
      return { committed: false, reason: 'LEASE_EXPIRED' };
    }

    if (attempt.grading_status !== 'grading') {
      await connection.rollback();
      return { committed: false, reason: 'INVALID_STATUS', status: attempt.grading_status };
    }

    const finalStatus = attempt.status === 'in_progress' ? 'completed' : attempt.status;

    const [updateResult] = await connection.execute(
      `UPDATE exam_attempts
       SET raw_score = ?,
           score = ?,
           status = ?,
           grading_status = 'graded',
           graded_at = CURRENT_TIMESTAMP,
           grading_lease_expires_at = NULL
       WHERE id = ? AND grading_fencing_token = ?`,
      [totalRawScore, normalizedScore, finalStatus, attemptId, workerFencingToken]
    );

    if (updateResult.affectedRows === 0) {
      await connection.rollback();
      return { committed: false, reason: 'COLLISION_DURING_COMMIT' };
    }

    await connection.commit();

    // Update Prometheus metrics
    activeAttemptsGauge.dec();
    attemptsCompletedTotal.inc({ status: finalStatus });

    return {
      committed: true,
      attemptId,
      rawScore: totalRawScore,
      maxRawScore,
      normalizedScore,
      status: finalStatus
    };
  } catch (error) {
    await connection.rollback();
    console.error(`[ScoringService.completeGradingJob] Error completing attempt ${attemptId}:`, error.message);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * End-to-end grade an attempt atomically using snapshot answers and choices
 * @param {number} attemptId 
 * @param {string} triggeredBy - 'submit' | 'expiry_worker' | 'recovery_worker'
 */
async function gradeAttempt(attemptId, triggeredBy = 'submit') {
  // Phase 1: Claim grading lease
  const claim = await claimGradingJob(attemptId, triggeredBy, 30);
  if (!claim.eligible) {
    return { success: false, message: claim.reason, attemptId };
  }

  // Phase 2: Compute score against immutable snapshots
  const connection = await db.getConnection();
  let totalRawScore = 0;
  let maxRawScore = 0;

  try {
    const [snapshots] = await connection.execute(
      `SELECT question_id, question_type, weight, snapshot_data
       FROM attempt_question_snapshots
       WHERE attempt_id = ?`,
      [attemptId]
    );

    const [answers] = await connection.execute(
      `SELECT question_id, selected_choice_ids
       FROM attempt_answers
       WHERE attempt_id = ?`,
      [attemptId]
    );

    const answerMap = new Map();
    for (const ans of answers) {
      let choiceIds = [];
      try {
        choiceIds = typeof ans.selected_choice_ids === 'string'
          ? JSON.parse(ans.selected_choice_ids)
          : (ans.selected_choice_ids || []);
      } catch (e) {
        choiceIds = [];
      }
      answerMap.set(ans.question_id, choiceIds.map(x => parseInt(x, 10)).sort((a, b) => a - b));
    }

    for (const snap of snapshots) {
      const weight = parseFloat(snap.weight) || 1.0;
      maxRawScore += weight;

      const qData = typeof snap.snapshot_data === 'string' ? JSON.parse(snap.snapshot_data) : snap.snapshot_data;
      const choices = qData.choices || [];

      const correctChoiceIds = choices
        .filter(c => c.is_correct === 1 || c.is_correct === true)
        .map(c => parseInt(c.id, 10))
        .sort((a, b) => a - b);

      const studentChoiceIds = answerMap.get(snap.question_id) || [];

      let isCorrect = false;
      if (correctChoiceIds.length === studentChoiceIds.length && correctChoiceIds.length > 0) {
        isCorrect = correctChoiceIds.every((val, idx) => val === studentChoiceIds[idx]);
      }

      const awardedScore = isCorrect ? weight : 0;
      totalRawScore += awardedScore;

      const choiceIdsJson = studentChoiceIds.length > 0 ? JSON.stringify(studentChoiceIds) : '[]';

      await connection.execute(
        `INSERT INTO attempt_answers (attempt_id, question_id, selected_choice_ids, is_correct, score_awarded)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           selected_choice_ids = COALESCE(attempt_answers.selected_choice_ids, VALUES(selected_choice_ids)),
           is_correct = VALUES(is_correct),
           score_awarded = VALUES(score_awarded)`,
        [attemptId, snap.question_id, choiceIdsJson, isCorrect ? 1 : 0, awardedScore]
      );
    }
  } finally {
    connection.release();
  }

  const normalizedScore = calculateNormalizedScore(totalRawScore, maxRawScore);

  // Phase 3: Complete grading job with fencing token
  const completion = await completeGradingJob(attemptId, claim.fencingToken, totalRawScore, maxRawScore, normalizedScore);
  if (!completion.committed) {
    return { success: false, message: completion.reason, attemptId };
  }

  return {
    success: true,
    attemptId,
    rawScore: totalRawScore,
    maxRawScore,
    normalizedScore,
    status: completion.status
  };
}

module.exports = {
  gradeAttempt,
  claimGradingJob,
  completeGradingJob,
  calculateNormalizedScore
};
