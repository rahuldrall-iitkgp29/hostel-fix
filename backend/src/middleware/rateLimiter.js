const { rateLimit } = require('express-rate-limit');
const { POLICY } = require('../config/policy');
const { AppError } = require('../utils/AppError');

function createIpLimiter(scope) {
  if (!['health', 'public', 'refresh'].includes(scope)) throw new TypeError('An IP rate-limit scope is required.');
  return rateLimit({
    ...POLICY.rates[scope], standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (req, res, next) => next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Try again later.')),
  });
}

function createUserLimiter(scope) {
  if (!['read', 'write', 'upload'].includes(scope)) throw new TypeError('A user rate-limit scope is required.');
  return rateLimit({
    ...POLICY.rates[scope], standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: (req) => String(req.user._id),
    handler: (req, res, next) => next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Try again later.')),
  });
}

module.exports = { createIpLimiter, createUserLimiter };
