class AppError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    if (fields?.length) this.fields = fields;
  }
}

const unavailable = () =>
  new AppError(
    503,
    'SERVICE_UNAVAILABLE',
    'Service is temporarily unavailable.'
  );

module.exports = { AppError, unavailable };
