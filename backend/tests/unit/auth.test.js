const jwt = require('jsonwebtoken');
const { randomUUID } = require('node:crypto');
const schemas = require('../../src/validators/auth.validators');
const hashes = require('../../src/utils/hashUtils');
const tokens = require('../../src/utils/tokens');
const { userInput, objectId } = require('../helpers/models.helper');
const { testEnv } = require('../helpers/env.helper');

const config = testEnv();
const password = '  Long Unicode password é  ';
const base = {
  name: ' Test Student ',
  email: ' Student@Example.Test ',
  password,
  hostelId: String(objectId()),
  blockId: String(objectId()),
  roomId: String(objectId()),
  enrollmentCode: 'VALID-CODE',
};

test('registration normalizes email/name and preserves passwords and codes verbatim', () => {
  expect(
    schemas.register.parse({ ...base, enrollmentCode: '  VALID-CODE  ' })
  ).toMatchObject({
    name: 'Test Student',
    email: 'student@example.test',
    password,
    enrollmentCode: '  VALID-CODE  ',
  });
});

test.each([
  ['role', 'ADMIN'],
  ['status', 'ACTIVE'],
  ['mustChangePassword', false],
  ['passwordHash', 'secret'],
  ['adminHostelIds', []],
  ['categoryIds', []],
  ['ownerId', String(objectId())],
  ['version', 1],
  ['email', { $ne: null }],
  ['hostelId', 'invalid'],
  ['blockId', 'a'.repeat(23)],
  ['roomId', 123],
  ['name', ' a '],
  ['email', 'invalid'],
  ['email', 'a'.repeat(245) + '@example.test'],
  ['password', 'too short'],
  ['password', 'a'.repeat(129)],
  ['password', '界'.repeat(86)],
  ['phone', '+012345678'],
  ['phone', '123456789'],
  ['phone', '+1234567'],
  ['enrollmentCode', 'short'],
  ['enrollmentCode', 'x'.repeat(65)],
])('rejects invalid/privileged registration field %s', (field, value) => {
  expect(schemas.register.safeParse({ ...base, [field]: value }).success).toBe(
    false
  );
});

test.each([
  ' '.repeat(12),
  'a'.repeat(128),
  'é'.repeat(128),
  'Valid\0password value',
])('accepts supported unmodified password %#', (value) => {
  expect(
    schemas.login.parse({ email: 'user@example.test', password: value })
      .password
  ).toBe(value);
});

test.each([
  {},
  { expectedVersion: 1 },
  { expectedVersion: '1', name: 'Student' },
  { expectedVersion: 0, phone: null },
  { expectedVersion: 1, email: 'another@example.test' },
  { expectedVersion: 1, name: 'Student', hostelId: base.hostelId },
  { expectedVersion: 1, phone: { $set: null } },
])('rejects invalid profile update %#', (input) => {
  expect(schemas.profile.safeParse(input).success).toBe(false);
});

test('profile accepts nullable phone and strictly rejects credential extras', () => {
  expect(schemas.profile.parse({ expectedVersion: 1, phone: null })).toEqual({
    expectedVersion: 1,
    phone: null,
  });
  expect(
    schemas.changePassword.safeParse({
      currentPassword: password,
      newPassword: password,
      role: 'ADMIN',
    }).success
  ).toBe(false);
  expect(schemas.empty.safeParse({ token: 'secret' }).success).toBe(false);
});

test('password hashing includes bytes after 72, Unicode, spaces and NUL', async () => {
  const value = 'é'.repeat(40) + '\0 untouched suffix ';
  const hash = await hashes.hashPassword(value);
  expect(hash).toMatch(/^\$2b\$12\$/);
  expect(await hashes.verifyPassword(value, hash)).toBe(true);
  expect(await hashes.verifyPassword(value.slice(0, -1), hash)).toBe(false);
  expect(
    await hashes.verifyPassword('é'.repeat(40) + '\0 changed suffix ', hash)
  ).toBe(false);
});

test('hashing domains differ and refresh/enrollment inputs are never bcrypt-truncated', async () => {
  const value = 'b'.repeat(128);
  const tokenHash = await hashes.hashRefreshToken(value);
  expect(await hashes.verifyRefreshToken(value, tokenHash)).toBe(true);
  expect(
    await hashes.verifyRefreshToken('b'.repeat(127) + 'c', tokenHash)
  ).toBe(false);
  expect(await hashes.verifyPassword(value, tokenHash)).toBe(false);
  const code = '界'.repeat(64);
  const codeHash = await hashes.hashEnrollmentCode(code);
  expect(codeHash).toMatch(/^\$2b\$10\$/);
  expect(await hashes.verifyEnrollmentCode(code, codeHash)).toBe(true);
  expect(
    await hashes.verifyEnrollmentCode('界'.repeat(63) + '中', codeHash)
  ).toBe(false);
});

test.each(['STUDENT', 'STAFF', 'ADMIN'])(
  'HS256 %s JWT includes only role-specific public claims with 600-second expiry',
  (role) => {
    const user = { _id: objectId(), ...userInput({ role }) };
    const record = { _id: objectId() };
    const token = tokens.issueAccessToken(user, record, config);
    const verified = tokens.verifyAccessToken(token, config);
    expect(jwt.decode(token, { complete: true }).header.alg).toBe('HS256');
    expect(verified).toMatchObject({
      sub: String(user._id),
      sid: String(record._id),
      role,
    });
    expect(verified.exp - verified.iat).toBe(600);
    expect(verified).not.toHaveProperty('passwordHash');
    expect(verified.adminHostelIds).toEqual(
      role === 'ADMIN' ? user.adminHostelIds.map(String) : undefined
    );
    expect(verified.categoryIds).toEqual(
      role === 'STAFF' ? user.categoryIds.map(String) : undefined
    );
  }
);

test.each([
  ['wrong signature', {}, { secret: 'wrong-secret' }],
  ['wrong algorithm', {}, { algorithm: 'HS384' }],
  ['missing sid', { sid: undefined }],
  ['invalid sub', { sub: 'invalid' }],
  ['bad expiry', { exp: 1 }],
  ['missing expiry', { exp: undefined }],
  ['extra claims', { passwordHash: 'private' }],
  [
    'future issued',
    {
      iat: Math.floor(Date.now() / 1000) + 300,
      exp: Math.floor(Date.now() / 1000) + 900,
    },
  ],
])('rejects %s JWT', (label, extra, options = {}) => {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: String(objectId()),
    sid: String(objectId()),
    role: 'STUDENT',
    hostelId: String(objectId()),
    iat: now,
    exp: now + 600,
    ...extra,
  };
  for (const key of Object.keys(payload))
    if (payload[key] === undefined) delete payload[key];
  const token = jwt.sign(payload, options.secret || config.JWT_SECRET, {
    algorithm: options.algorithm || 'HS256',
  });
  expect(() => tokens.verifyAccessToken(token, config)).toThrow();
});

test('expired access token is distinguished from missing/invalid authentication', () => {
  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    {
      sub: String(objectId()),
      sid: String(objectId()),
      role: 'STUDENT',
      hostelId: null,
      iat: now - 601,
      exp: now - 1,
    },
    config.JWT_SECRET
  );
  expect(() => tokens.verifyAccessToken(token, config)).toThrow(
    expect.objectContaining({ code: 'TOKEN_EXPIRED' })
  );
  expect(() => tokens.bearerToken({ get: () => undefined })).toThrow(
    expect.objectContaining({ code: 'AUTH_REQUIRED' })
  );
  expect(() => tokens.bearerToken({ get: () => 'Basic abc' })).toThrow(
    expect.objectContaining({ code: 'SESSION_INVALID' })
  );
});

test('refresh cookie has one strict family locator and full 64-byte secret', () => {
  const token = tokens.newRefreshToken();
  const next = tokens.newRefreshToken(token.family);
  expect(token.secret).toMatch(/^[a-f\d]{128}$/);
  expect(next.family).toBe(token.family);
  expect(next.secret === token.secret).toBe(false);
  expect(
    tokens.readRefreshCookie({
      headers: { cookie: `other=1; hf_refresh=${token.cookie}` },
    })
  ).toEqual({ family: token.family, secret: token.secret });
  for (const cookie of [
    '',
    'hf_refresh=bad',
    `hf_refresh=${token.cookie}; hf_refresh=${next.cookie}`,
    `hf_refresh=v1.${randomUUID()}.${token.secret.toUpperCase()}`,
    `hf_refresh="${token.cookie}"`,
    `hf_refresh=${token.cookie}.extra`,
  ]) {
    expect(tokens.readRefreshCookie({ headers: { cookie } })).toBeNull();
  }
});
