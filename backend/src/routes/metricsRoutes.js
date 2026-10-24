const express = require('express');
const router = express.Router();
const { register } = require('../config/metrics');

router.get('/', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error.message);
  }
});

module.exports = router;
