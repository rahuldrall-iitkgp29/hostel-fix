const request = require('supertest');
const { createApp } = require('../../src/app');
const { parseEnv } = require('../../src/config/env');
const { refreshCookieOptions } = require('../../src/config/policy');
const { verifyIndexes } = require('../../src/models');
const { testEnv } = require('../helpers/env.helper');

test.each(['true', '1', '*', '0.0.0.0/0', '::/0', '127.0.0.1/33'])(
  'rejects broad or invalid trusted proxy settings: %s',
  (TRUST_PROXY) => {
    expect(() => parseEnv(testEnv({ TRUST_PROXY }))).toThrow('TRUST_PROXY');
  }
);
test('production cookie options remain secure, HttpOnly, Strict and scoped', () => {
  const config = parseEnv(
    testEnv({
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://hostelfix.example.test',
      COOKIE_DOMAIN: '.example.test',
    })
  );
  expect(refreshCookieOptions(config)).toMatchObject({
    secure: true,
    httpOnly: true,
    sameSite: 'strict',
    path: '/api/v1/auth',
    domain: '.example.test',
  });
  expect(() => parseEnv(testEnv({ COOKIE_DOMAIN: 'unrelated.test' }))).toThrow(
    'COOKIE_DOMAIN'
  );
});
test('only configured proxy addresses influence Express client IP', async () => {
  for (const [TRUST_PROXY, expected] of [
    [false, false],
    [['loopback'], true],
  ]) {
    const app = createApp({ config: { TRUST_PROXY } });
    // Test the configured Express trust function, including an untrusted hop.
    const trust = app.get('trust proxy fn');
    expect(trust('127.0.0.1', 0)).toBe(expected);
    expect(trust('203.0.113.1', 0)).toBe(false);
    await request(app).get('/api/v1/health').expect(200);
  }
});
test('startup index verification rejects missing or non-unique required indexes', async () => {
  const model = (actual) => ({
    schema: { indexes: () => [[{ email: 1 }, { unique: true }]] },
    collection: { listIndexes: () => ({ toArray: async () => actual }) },
  });
  await expect(
    verifyIndexes({ User: model([{ key: { email: 1 } }]) })
  ).rejects.toThrow('indexes');
  await expect(
    verifyIndexes({ User: model([{ key: { email: 1 }, unique: true }]) })
  ).resolves.toBeUndefined();
});
