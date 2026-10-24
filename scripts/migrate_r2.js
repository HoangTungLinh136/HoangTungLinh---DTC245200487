const mysql = require('../backend/node_modules/mysql2/promise');

async function migrate() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'quiz_user',
    password: 'QuizPass123!',
    database: 'quizsystem'
  });
  console.log('Connected to MySQL. Applying non-destructive R2 migrations...');

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS attempt_receipts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      attempt_id INT NOT NULL,
      actor_id INT NOT NULL,
      request_id VARCHAR(64) NOT NULL,
      operation ENUM('SAVE', 'SUBMIT') NOT NULL,
      digest VARCHAR(64) NOT NULL,
      outcome_status VARCHAR(20) NOT NULL DEFAULT 'COMMITTED',
      response_body JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_receipt_attempt FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id) ON DELETE CASCADE,
      CONSTRAINT fk_receipt_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY uq_actor_attempt_request (actor_id, attempt_id, request_id),
      INDEX idx_receipt_attempt (attempt_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('Verified table attempt_receipts.');

    await conn.execute("ALTER TABLE attempt_receipts MODIFY COLUMN operation VARCHAR(32) NOT NULL");
    console.log('Modified attempt_receipts.operation to VARCHAR(32).');

    const [cols] = await conn.execute("SHOW COLUMNS FROM exam_attempts LIKE 'grading_retry_count'");
    if (cols.length === 0) {
      await conn.execute("ALTER TABLE exam_attempts ADD COLUMN grading_retry_count INT NOT NULL DEFAULT 0");
      console.log('Added grading_retry_count to exam_attempts.');
    }

    console.log('Migration completed successfully.');
  await conn.end();
}

migrate().catch(console.error);
