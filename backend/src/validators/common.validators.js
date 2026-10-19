const { z } = require('zod');
const { AppError } = require('../utils/AppError');

const id = z.string().regex(/^[a-f\d]{24}$/i).transform((value) => value.toLowerCase());
const version = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const name = z.string().trim().min(2).max(80);
const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const password = z.string().min(12).max(128)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 256);
const phone = z.string().regex(/^\+[1-9]\d{7,14}$/).nullable();
const empty = z.strictObject({});

function noQuery(req, res, next) {
  if (!empty.safeParse(req.query).success) {
    return next(new AppError(422, 'VALIDATION_ERROR', 'Query parameters are not accepted.'));
  }
  return next();
}

function noInput(req, res, next) {
  if (Number(req.headers['content-length'] || 0) > 0 || req.headers['transfer-encoding'] !== undefined) {
    return next(new AppError(422, 'VALIDATION_ERROR', 'This request does not accept a body.'));
  }
  return noQuery(req, res, next);
}

module.exports = { id, version, name, email, password, phone, empty, noQuery, noInput };
