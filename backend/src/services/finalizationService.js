const attemptRepo = require('../repositories/attemptRepository');
const sessionRepo = require('../repositories/sessionRepository');
const passwordResetRepo = require('../repositories/passwordResetRepository');
const { gradeAttempt } = require('./scoringService');

/**
 * Scan and finalize all in_progress attempts whose deadline has passed (BD-07, C-FIN)
 */
async function processExpiredAttempts() {
  try {
    const expiredAttempts = await attemptRepo.findExpiredInProgress(50);
    if (!expiredAttempts || expiredAttempts.length === 0) {
      return 0;
    }

    console.log(`[FinalizationService] Found ${expiredAttempts.length} expired attempts to finalize`);

    for (const att of expiredAttempts) {
      try {
        const finalized = await attemptRepo.updateStatus(att.id, 'expired');
        if (finalized) {
          await gradeAttempt(att.id, 'expiry_worker');
          console.log(`[FinalizationService] Auto-finalized attempt ${att.id}`);
        }
      } catch (err) {
        console.error(`[FinalizationService] Failed to finalize attempt ${att.id}:`, err.message);
      }
    }

    return expiredAttempts.length;
  } catch (error) {
    console.error('[FinalizationService] Error processing expired attempts:', error.message);
    return 0;
  }
}

/**
 * Crash & retry recovery for grading workers (IA01-F05, C-GRADE)
 * Reclaims attempts stuck in 'grading' past lease or 'ungraded' after completion
 */
async function processStaleGradingRecovery() {
  try {
    const staleAttempts = await attemptRepo.findStaleGradingAttempts(50);
    if (!staleAttempts || staleAttempts.length === 0) {
      return 0;
    }

    console.log(`[FinalizationService] Found ${staleAttempts.length} stale grading attempts to recover`);

    for (const att of staleAttempts) {
      try {
        await gradeAttempt(att.id, 'recovery_worker');
        console.log(`[FinalizationService] Successfully recovered grading for attempt ${att.id}`);
      } catch (err) {
        console.error(`[FinalizationService] Failed recovery for attempt ${att.id}:`, err.message);
      }
    }

    return staleAttempts.length;
  } catch (error) {
    console.error('[FinalizationService] Error recovering stale grading:', error.message);
    return 0;
  }
}

/**
 * Housekeeping worker: Purge expired sessions and password reset tokens (IA01-F07, BD-11)
 */
async function processExpiredTokenCleanup() {
  try {
    const cleanedSessions = await sessionRepo.deleteExpiredSessions();
    const cleanedTokens = await passwordResetRepo.deleteExpiredTokens();
    if (cleanedSessions > 0 || cleanedTokens > 0) {
      console.log(`[Housekeeping] Purged ${cleanedSessions} expired sessions and ${cleanedTokens} reset tokens`);
    }
  } catch (error) {
    console.error('[Housekeeping] Error cleaning up expired tokens:', error.message);
  }
}

/**
 * Start periodic background workers
 * @param {number} intervalMs 
 */
function startFinalizationWorker(intervalMs = 10000) {
  // Expiry and grading recovery tick
  const timer = setInterval(async () => {
    await processExpiredAttempts();
    await processStaleGradingRecovery();
  }, intervalMs);
  if (timer.unref) timer.unref();

  // Housekeeping tick every 60 seconds
  const cleanupTimer = setInterval(async () => {
    await processExpiredTokenCleanup();
  }, 60000);
  if (cleanupTimer.unref) cleanupTimer.unref();

  return { timer, cleanupTimer };
}

module.exports = {
  processExpiredAttempts,
  processStaleGradingRecovery,
  processExpiredTokenCleanup,
  startFinalizationWorker
};
