const { httpRequestDurationSeconds, httpRequestsTotal } = require('../config/metrics');

/**
 * Middleware to record HTTP request metrics for Prometheus
 */
function metricsMiddleware(req, res, next) {
  const start = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationInSeconds = diff[0] + diff[1] / 1e9;
    const route = req.route ? req.route.path : req.path;
    const statusCode = res.statusCode ? res.statusCode.toString() : '500';

    httpRequestDurationSeconds.observe(
      { method: req.method, route, status_code: statusCode },
      durationInSeconds
    );

    httpRequestsTotal.inc({
      method: req.method,
      route,
      status_code: statusCode
    });
  });

  next();
}

module.exports = metricsMiddleware;
