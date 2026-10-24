const crypto = require('crypto');
const db = require('../config/db');

/**
 * Receipt Repository - Data Access Layer for attempt_receipts (R8-D01..08, R8-D09/10, C-ORDER)
 * Handles idempotent request replay, duplicate request_id detection, and lost ACK reconciliation.
 */
class ReceiptRepository {
  computeDigest(payload) {
    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  async findByRequestKeyForUpdate(actorId, attemptId, requestId, connection) {
    const [rows] = await connection.execute(
      `SELECT id, attempt_id, actor_id, request_id, operation, digest, outcome_status, response_body, created_at
       FROM attempt_receipts
       WHERE actor_id = ? AND attempt_id = ? AND request_id = ? FOR UPDATE`,
      [actorId, attemptId, requestId]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      ...r,
      response_body: typeof r.response_body === 'string' ? JSON.parse(r.response_body) : r.response_body
    };
  }

  async findByRequestKey(actorId, attemptId, requestId, connection = null) {
    const client = connection || db;
    const [rows] = await client.execute(
      `SELECT id, attempt_id, actor_id, request_id, operation, digest, outcome_status, response_body, created_at
       FROM attempt_receipts
       WHERE actor_id = ? AND attempt_id = ? AND request_id = ?`,
      [actorId, attemptId, requestId]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      ...r,
      response_body: typeof r.response_body === 'string' ? JSON.parse(r.response_body) : r.response_body
    };
  }

  async recordReceipt(receiptData, connection) {
    const { attemptId, actorId, requestId, operation, digest, outcomeStatus = 'COMMITTED', responseBody } = receiptData;
    const responseJson = responseBody ? JSON.stringify(responseBody) : null;

    const [result] = await connection.execute(
      `INSERT INTO attempt_receipts (attempt_id, actor_id, request_id, operation, digest, outcome_status, response_body)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [attemptId, actorId, requestId, operation, digest, outcomeStatus, responseJson]
    );
    return result.insertId;
  }
}

module.exports = new ReceiptRepository();
