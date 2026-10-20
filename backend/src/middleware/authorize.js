const { AppError } = require('../utils/AppError');

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError(403, 'FORBIDDEN', 'Access forbidden.'));
    }
    return next();
  };
}

module.exports = { requireRole };
