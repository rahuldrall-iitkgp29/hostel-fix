const { createHash, randomBytes } = require('node:crypto');
const bcrypt = require('bcrypt');

const costs = Object.freeze({ password: 12, enrollment: 10, refresh: 12 });
function prehash(value, purpose) {
  if (typeof value !== 'string' || !Object.hasOwn(costs, purpose))
    throw new TypeError('Invalid hash input.');
  return createHash('sha256')
    .update(`hostelfix:${purpose}:v1\0`, 'utf8')
    .update(value, 'utf8')
    .digest('base64');
}
const hash = (value, purpose) =>
  bcrypt.hash(prehash(value, purpose), costs[purpose]);
const verify = (value, storedHash, purpose) =>
  bcrypt.compare(prehash(value, purpose), storedHash);
const dummyHashes = new Map();
function dummyHash(purpose) {
  if (!dummyHashes.has(purpose))
    dummyHashes.set(purpose, hash(randomBytes(64).toString('hex'), purpose));
  return dummyHashes.get(purpose);
}

module.exports = {
  hashPassword: (value) => hash(value, 'password'),
  verifyPassword: (value, storedHash) => verify(value, storedHash, 'password'),
  hashEnrollmentCode: (value) => hash(value, 'enrollment'),
  verifyEnrollmentCode: (value, storedHash) =>
    verify(value, storedHash, 'enrollment'),
  hashRefreshToken: (value) => hash(value, 'refresh'),
  verifyRefreshToken: (value, storedHash) =>
    verify(value, storedHash, 'refresh'),
  dummyHash,
};
