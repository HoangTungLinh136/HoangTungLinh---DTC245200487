const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.get('/health', async (req, res) => {
  return res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

router.get('/ready', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 AS ready');
    if (rows && rows[0].ready === 1) {
      return res.json({ status: 'ready', database: 'connected' });
    }
    return res.status(503).json({ status: 'unready', database: 'query failed' });
  } catch (error) {
    return res.status(503).json({ status: 'unready', database: error.message });
  }
});

module.exports = router;
