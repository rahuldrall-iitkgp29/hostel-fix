const { AppError, unavailable } = require('../utils/AppError');

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let safeError = error instanceof AppError ? error : unavailable();
  if (error?.type === 'entity.parse.failed') safeError = new AppError(400, 'MALFORMED_JSON', 'Request body must be valid JSON.');
  if (error?.type === 'entity.too.large') safeError = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  if (['charset.unsupported', 'encoding.unsupported'].includes(error?.type)) {
    safeError = new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Request encoding is unsupported.');
  }
  if (safeError.status >= 500) req.app.locals.logger?.error({ requestId: req.requestId, code: safeError.code }, 'Request failed.');
  return res.status(safeError.status).json({
    error: {
      code: safeError.code, message: safeError.message,
      ...(safeError.fields ? { fields: safeError.fields } : {}), requestId: req.requestId,
    },
  });
}

module.exports = { errorHandler };
