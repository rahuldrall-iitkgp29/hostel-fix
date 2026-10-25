const cors = require('cors');
const { POLICY } = require('./policy');

function createCors(config) {
  return cors({
    origin: (origin, callback) =>
      callback(null, Boolean(origin && origin === config.CORS_ORIGIN)),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', POLICY.csrfHeader],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: 86400,
  });
}

module.exports = { createCors };
