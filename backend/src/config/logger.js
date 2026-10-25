const pino = require('pino');

function createLogger(config, destination) {
  return pino(
    { level: config.LOG_LEVEL || 'info', base: undefined },
    destination
  );
}

// Deliberately log only bounded metadata, never req/res, URLs, headers, bodies,
// configuration or raw errors (including driver errors with credentials/paths).
function requestLogger(logger) {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.once('finish', () =>
      logger.info(
        {
          requestId: req.requestId,
          method: req.method,
          statusCode: res.statusCode,
          durationMs: Number(process.hrtime.bigint() - start) / 1e6,
        },
        'HTTP request completed.'
      )
    );
    next();
  };
}

module.exports = { createLogger, requestLogger };
