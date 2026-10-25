const { AppError } = require('../utils/AppError');
const { POLICY } = require('../config/policy');

function createCsrf(config) {
  return (req, res, next) => {
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
      (!config.CORS_ORIGIN ||
        req.get('Origin') !== config.CORS_ORIGIN ||
        req.get(POLICY.csrfHeader) !== POLICY.csrfValue)
    ) {
      return next(
        new AppError(
          403,
          'CSRF_INVALID',
          'Origin and CSRF protection headers are required.'
        )
      );
    }
    return next();
  };
}

module.exports = { createCsrf };
