const { AppError } = require('../utils/AppError');

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(
        new AppError(
          422,
          'VALIDATION_ERROR',
          'Request validation failed.',
          result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: 'Invalid value.',
          }))
        )
      );
    }
    req.body = result.data;
    return next();
  };
}

module.exports = { validateBody };
