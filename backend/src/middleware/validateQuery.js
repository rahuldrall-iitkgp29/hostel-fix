const { AppError } = require('../utils/AppError');

function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(
        new AppError(
          422,
          'VALIDATION_ERROR',
          'Request query validation failed.',
          result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: 'Invalid value.',
          }))
        )
      );
    }
    req.query = result.data;
    return next();
  };
}

module.exports = { validateQuery };
