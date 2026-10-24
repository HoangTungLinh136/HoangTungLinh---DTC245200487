const client = require('prom-client');
const attemptRepo = require('../repositories/attemptRepository');

// Initialize default system metrics (memory, cpu, gc, event loop)
const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'quizsystem_' });

// HTTP request duration histogram
const httpRequestDurationSeconds = new client.Histogram({
  name: 'quizsystem_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5]
});
register.registerMetric(httpRequestDurationSeconds);

// HTTP requests total counter
const httpRequestsTotal = new client.Counter({
  name: 'quizsystem_http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status_code']
});
register.registerMetric(httpRequestsTotal);

// Active exam attempts gauge (Authoritative state dynamically queried from MySQL)
const activeAttemptsGauge = new client.Gauge({
  name: 'quizsystem_active_attempts_total',
  help: 'Current count of active in-progress student exam attempts',
  async collect() {
    try {
      const stats = await attemptRepo.countActiveAttempts();
      this.set(stats.inProgressCount);
    } catch (err) {
      console.error('[Metrics] Failed to collect active attempts from database:', err.message);
      // Requirement 5: Do NOT set false values (such as 0 or -1).
      // Rethrowing causes register.metrics() to fail, prompting /metrics to return 500,
      // signaling scrape failure to Prometheus and preventing ingestion of misleading data.
      throw err;
    }
  }
});
register.registerMetric(activeAttemptsGauge);

// Completed attempts counter
const attemptsCompletedTotal = new client.Counter({
  name: 'quizsystem_attempts_completed_total',
  help: 'Total count of completed exam attempts',
  labelNames: ['status'] // completed, expired, abandoned
});
register.registerMetric(attemptsCompletedTotal);

module.exports = {
  register,
  httpRequestDurationSeconds,
  httpRequestsTotal,
  activeAttemptsGauge,
  attemptsCompletedTotal
};
