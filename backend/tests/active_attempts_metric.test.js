const test = require('node:test');
const assert = require('node:assert');

process.env.DB_PORT = process.env.DB_PORT || '3307';
const db = require('../src/config/db');
const attemptRepo = require('../src/repositories/attemptRepository');
const { register, activeAttemptsGauge } = require('../src/config/metrics');
const { completeGradingJob } = require('../src/services/scoringService');

test('Active Attempts Metric Test Suite', async (t) => {
  // Helper to extract active attempts value from register.metrics()
  async function getActiveAttemptsMetricValue() {
    const metricsStr = await register.metrics();
    const match = metricsStr.match(/^quizsystem_active_attempts_total\s+(-?\d+(?:\.\d+)?)/m);
    return match ? Number(match[1]) : null;
  }

  // 1. Process Restart Simulation: Metric reflects DB immediately upon query
  await t.test('1. Backend Restart: metric dynamically queries MySQL and reflects real DB state', async () => {
    const stats = await attemptRepo.countActiveAttempts();
    assert.strictEqual(typeof stats.inProgressCount, 'number');
    assert.ok(stats.inProgressCount >= 0, 'inProgressCount must be non-negative');

    const metricValue = await getActiveAttemptsMetricValue();
    assert.strictEqual(metricValue, stats.inProgressCount, 'Metric value must match MySQL in_progress count');
    assert.ok(metricValue >= 0, 'Metric value must not be negative');
  });

  // 2. Transaction Rollback: No ghost increments
  await t.test('2. Transaction Rollback: rolled back attempt does not increment metric', async () => {
    const initialValue = await getActiveAttemptsMetricValue();

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      // Insert in-progress attempt inside uncommitted transaction
      await conn.execute(
        `INSERT INTO exam_attempts (exam_id, student_id, attempt_number, status, started_at, deadline_at)
         VALUES (1, 24, 991, 'in_progress', NOW(), DATE_ADD(NOW(), INTERVAL 30 MINUTE))`
      );
      // Simulate transaction rollback (e.g. failure during snapshotting)
      await conn.rollback();
    } finally {
      conn.release();
    }

    const afterRollbackValue = await getActiveAttemptsMetricValue();
    assert.strictEqual(afterRollbackValue, initialValue, 'Metric must remain unchanged after transaction rollback');
  });

  // 3. Submit Attempt: Status transition in_progress -> completed decrements count
  await t.test('3. Submit Attempt: status transition from in_progress to completed decrements metric', async () => {
    let testAttemptId = null;
    const initialValue = await getActiveAttemptsMetricValue();

    try {
      const [insertRes] = await db.execute(
        `INSERT INTO exam_attempts (exam_id, student_id, attempt_number, status, started_at, deadline_at)
         VALUES (1, 24, 992, 'in_progress', NOW(), DATE_ADD(NOW(), INTERVAL 30 MINUTE))`
      );
      testAttemptId = insertRes.insertId;

      const inProgressValue = await getActiveAttemptsMetricValue();
      assert.strictEqual(inProgressValue, initialValue + 1, 'Metric should increase by 1 while attempt is in_progress');

      // Update to completed
      await db.execute(
        `UPDATE exam_attempts SET status = 'completed', submitted_at = NOW() WHERE id = ?`,
        [testAttemptId]
      );

      const completedValue = await getActiveAttemptsMetricValue();
      assert.strictEqual(completedValue, initialValue, 'Metric should return to initial value after attempt completion');
    } finally {
      if (testAttemptId) {
        await db.execute('DELETE FROM exam_attempts WHERE id = ?', [testAttemptId]);
      }
    }
  });

  // 4. Deadline Expiration: Status transition in_progress -> expired decrements count
  await t.test('4. Deadline Expiry: status transition from in_progress to expired decrements metric', async () => {
    let testAttemptId = null;
    const initialValue = await getActiveAttemptsMetricValue();

    try {
      const [insertRes] = await db.execute(
        `INSERT INTO exam_attempts (exam_id, student_id, attempt_number, status, started_at, deadline_at)
         VALUES (1, 24, 993, 'in_progress', DATE_SUB(NOW(), INTERVAL 40 MINUTE), DATE_SUB(NOW(), INTERVAL 10 MINUTE))`
      );
      testAttemptId = insertRes.insertId;

      const beforeExpiryValue = await getActiveAttemptsMetricValue();
      assert.strictEqual(beforeExpiryValue, initialValue + 1, 'Metric increases by 1 when created in_progress');

      // Finalize to expired
      await db.execute(
        `UPDATE exam_attempts SET status = 'expired' WHERE id = ?`,
        [testAttemptId]
      );

      const afterExpiryValue = await getActiveAttemptsMetricValue();
      assert.strictEqual(afterExpiryValue, initialValue, 'Metric decreases by 1 after attempt expired');
    } finally {
      if (testAttemptId) {
        await db.execute('DELETE FROM exam_attempts WHERE id = ?', [testAttemptId]);
      }
    }
  });

  // 5. Idempotent Grading: Re-grading does not cause duplicate decrements or negative drift
  await t.test('5. Idempotent Grading: re-grading already graded attempt does not decrement metric', async () => {
    let testAttemptId = null;
    const initialValue = await getActiveAttemptsMetricValue();

    try {
      const [insertRes] = await db.execute(
        `INSERT INTO exam_attempts (exam_id, student_id, attempt_number, status, grading_status, grading_fencing_token, started_at, deadline_at)
         VALUES (1, 24, 994, 'completed', 'graded', 1, NOW(), DATE_ADD(NOW(), INTERVAL 30 MINUTE))`
      );
      testAttemptId = insertRes.insertId;

      // Attempt completeGradingJob with mismatched or already graded fencing token
      try {
        await completeGradingJob(testAttemptId, 999, 10, 10, 10);
      } catch (e) {
        // Expected collision/fencing token mismatch
      }

      const metricAfterDoubleGrading = await getActiveAttemptsMetricValue();
      assert.strictEqual(metricAfterDoubleGrading, initialValue, 'Metric must not be decremented by repeated grading calls');
    } finally {
      if (testAttemptId) {
        await db.execute('DELETE FROM exam_attempts WHERE id = ?', [testAttemptId]);
      }
    }
  });

  // 6. Recovery Worker: Grading recovered attempts does not drift to negative
  await t.test('6. Recovery Worker: grading recovered stale attempts does not cause negative metric', async () => {
    let testAttemptId = null;
    const initialValue = await getActiveAttemptsMetricValue();

    try {
      const [insertRes] = await db.execute(
        `INSERT INTO exam_attempts (exam_id, student_id, attempt_number, status, grading_status, grading_fencing_token, started_at, deadline_at)
         VALUES (1, 24, 995, 'completed', 'grading', 1, NOW(), DATE_ADD(NOW(), INTERVAL 30 MINUTE))`
      );
      testAttemptId = insertRes.insertId;

      // Complete the grading job for this recovered attempt
      const result = await completeGradingJob(testAttemptId, 1, 8.0, 10.0, 8.0);
      assert.strictEqual(result.committed, true, 'Grading job should commit successfully');

      const afterRecoveryValue = await getActiveAttemptsMetricValue();
      assert.strictEqual(afterRecoveryValue, initialValue, 'Metric must stay consistent with DB and not drift negatively');
      assert.ok(afterRecoveryValue >= 0, 'Metric must not be negative');
    } finally {
      if (testAttemptId) {
        await db.execute('DELETE FROM exam_attempts WHERE id = ?', [testAttemptId]);
      }
    }
  });

  // 7. MySQL Error Safety: Database query failure rejects rather than emitting false data
  await t.test('7. MySQL Error Safety: query failure throws error without emitting false 0 or -1', async () => {
    // Temporarily mock countActiveAttempts to simulate database connection outage
    const originalMethod = attemptRepo.countActiveAttempts;
    try {
      attemptRepo.countActiveAttempts = async () => {
        throw new Error('ECONNREFUSED: Database connection failure');
      };

      await assert.rejects(
        async () => {
          await register.metrics();
        },
        /ECONNREFUSED/,
        'register.metrics() must fail when MySQL query fails, preventing ingestion of false metrics'
      );
    } finally {
      attemptRepo.countActiveAttempts = originalMethod;
    }
  });

  t.after(async () => {
    await db.end();
  });
});
