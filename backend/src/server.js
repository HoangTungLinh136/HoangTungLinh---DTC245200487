const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');

dotenv.config();

const metricsMiddleware = require('./middleware/metricsMiddleware');
const { startFinalizationWorker } = require('./services/finalizationService');

// Route imports
const authRoutes = require('./routes/authRoutes');
const questionRoutes = require('./routes/questionRoutes');
const examRoutes = require('./routes/examRoutes');
const attemptRoutes = require('./routes/attemptRoutes');
const adminRoutes = require('./routes/adminRoutes');
const metricsRoutes = require('./routes/metricsRoutes');
const healthRoutes = require('./routes/healthRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Express reverse proxy trust: 1 hop from Nginx (SEC-02 IP extraction)
app.set('trust proxy', 1);

// CORS configuration (SEC-01: Restricted Origin whitelist with credentials)
const defaultAllowedOrigins = [
  'http://localhost',
  'http://127.0.0.1',
  'http://localhost:80',
  'http://127.0.0.1:80',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

const allowedOriginsSet = new Set(defaultAllowedOrigins);
if (process.env.FRONTEND_URL) {
  try {
    const parsed = new URL(process.env.FRONTEND_URL);
    allowedOriginsSet.add(parsed.origin);
  } catch (_) {
    allowedOriginsSet.add(process.env.FRONTEND_URL.trim());
  }
}
if (process.env.ALLOWED_ORIGINS) {
  process.env.ALLOWED_ORIGINS.split(',').forEach(o => {
    const trimmed = o.trim();
    if (trimmed) allowedOriginsSet.add(trimmed);
  });
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests with no origin (e.g. same-origin via Nginx proxy, curl, server-to-server)
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOriginsSet.has(origin)) {
      return callback(null, true);
    }
    // Block untrusted origins by withholding Access-Control-Allow-Origin
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Metrics middleware
app.use(metricsMiddleware);

// Structured request logging for Promtail / Loki
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    };
    // Log as JSON line for Loki/Promtail ingestion
    console.log(JSON.stringify(logData));
  });
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/admin', adminRoutes);
app.use('/metrics', metricsRoutes);
app.use('/', healthRoutes);

// Serve frontend static files
const frontendPath = path.join(__dirname, '../../frontend');
app.use(express.static(frontendPath));

// Fallback for HTML5 client routing if accessed directly
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/metrics') {
    return next();
  }
  res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
    if (err) {
      res.status(404).send('QuizSystem Frontend Not Found');
    }
  });
});

// Centralized error handling
app.use((err, req, res, next) => {
  console.error('[UnhandledError]', err.stack || err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

if (process.env.NODE_ENV !== 'test') {
  // Start background finalization scheduler (BD-07)
  startFinalizationWorker(10000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[QuizSystem] Backend server is listening on port ${PORT}`);
    console.log(`[QuizSystem] Metrics available at http://localhost:${PORT}/metrics`);
  });
}

module.exports = app;
