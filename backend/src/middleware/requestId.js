const { randomUUID } = require('node:crypto');

function requestId(req, res, next) {
  req.requestId = randomUUID();
  res.set('X-Request-Id', req.requestId);
  next();
}

module.exports = { requestId };
