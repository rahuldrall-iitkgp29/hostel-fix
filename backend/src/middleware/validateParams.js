const { AppError } = require('../utils/AppError');

function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      return next(
        new AppError(
          422,
          'VALIDATION_ERROR',
          'Request parameter validation failed.',
          result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: 'Invalid value.',
          }))
        )
      );
    }
    req.params = result.data;
    return next();
  };
}

module.exports = { validateParams };
