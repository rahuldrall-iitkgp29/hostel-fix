const { z } = require('zod');
const { AppError } = require('../utils/AppError');

const emptyQuery = z.strictObject({});

function validateHealthRequest(req, res, next) {
  const hasBody = Number(req.headers['content-length'] || 0) > 0 || req.headers['transfer-encoding'] !== undefined;
  if (!emptyQuery.safeParse(req.query).success || hasBody) {
    return next(new AppError(422, 'VALIDATION_ERROR', 'Health requests do not accept input.'));
  }
  return next();
}

module.exports = { validateHealthRequest };
