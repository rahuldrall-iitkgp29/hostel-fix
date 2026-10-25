const { randomBytes, randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { id } = require('../validators/common.validators');
const { AppError } = require('./AppError');
const { POLICY, refreshCookieOptions } = require('../config/policy');

const claimsSchema = z
  .strictObject({
    sub: id,
    sid: id,
    role: z.enum(['STUDENT', 'STAFF', 'ADMIN']),
    hostelId: id.nullable(),
    iat: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
    adminHostelIds: z.array(id).optional(),
    categoryIds: z.array(id).optional(),
  })
  .refine((value) => value.exp - value.iat === 600);
const invalidSession = () =>
  new AppError(
    401,
    'SESSION_INVALID',
    'Session is invalid. Please log in again.'
  );

function issueAccessToken(user, session, config) {
  return jwt.sign(
    {
      sub: String(user._id),
      sid: String(session._id),
      role: user.role,
      hostelId: user.hostelId == null ? null : String(user.hostelId),
      ...(user.role === 'ADMIN'
        ? { adminHostelIds: user.adminHostelIds.map(String) }
        : {}),
      ...(user.role === 'STAFF'
        ? { categoryIds: user.categoryIds.map(String) }
        : {}),
    },
    config.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: 600 }
  );
}

function verifyAccessToken(token, config) {
  if (typeof token !== 'string' || token.length > 8192) throw invalidSession();
  try {
    const claims = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ['HS256'],
    });
    const parsed = claimsSchema.safeParse(claims);
    if (!parsed.success || parsed.data.iat > Math.floor(Date.now() / 1000))
      throw invalidSession();
    return parsed.data;
  } catch (error) {
    if (error.name === 'TokenExpiredError')
      throw new AppError(401, 'TOKEN_EXPIRED', 'Access token has expired.');
    throw invalidSession();
  }
}

function bearerToken(req) {
  const header = req.get('Authorization');
  if (!header)
    throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
  const match =
    /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(header);
  if (!match) throw invalidSession();
  return match[1];
}

function newRefreshToken(family = randomUUID()) {
  const secret = randomBytes(64).toString('hex');
  return { family, secret, cookie: `v1.${family}.${secret}` };
}

function readRefreshCookie(req) {
  const values = (req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.split('=', 1)[0] === POLICY.cookieName);
  if (values.length !== 1) return null;
  const value = values[0].slice(POLICY.cookieName.length + 1);
  const match =
    /^v1\.([a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12})\.([a-f\d]{128})$/.exec(
      value
    );
  return match ? { family: match[1], secret: match[2] } : null;
}

function clearRefreshCookie(res, config) {
  const { maxAge, ...options } = refreshCookieOptions(config);
  res.clearCookie(POLICY.cookieName, options);
}

module.exports = {
  invalidSession,
  issueAccessToken,
  verifyAccessToken,
  bearerToken,
  newRefreshToken,
  readRefreshCookie,
  clearRefreshCookie,
};
