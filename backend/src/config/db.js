const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'quiz_user',
  password: process.env.DB_PASSWORD || 'QuizPass123!',
  database: process.env.DB_NAME || 'quizsystem',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
  timezone: '+07:00'
});

module.exports = pool;
