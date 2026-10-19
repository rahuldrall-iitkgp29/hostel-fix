const path = require('node:path');
const { ConfigurationError, parseEnv, loadEnv } = require('../../src/config/env');
const { testEnv } = require('../helpers/env.helper');

describe('environment validation', () => {
  test('requires explicit configuration and reports names only', () => {
    expect(() => parseEnv({})).toThrow(ConfigurationError);
    try {
      parseEnv({});
    } catch (error) {
      expect(error.fields).toEqual(['CORS_ORIGIN', 'JWT_SECRET', 'MONGODB_URI', 'UPLOAD_DIR']);
    }
  });

  test('applies PRD defaults without mutating or exporting unrelated process variables', () => {
    const source = testEnv({ NODE_ENV: undefined, UNRELATED_SECRET: 'private' });
    const config = parseEnv(source);
    expect(config).toMatchObject({
      NODE_ENV: 'development', PORT: 5000, COOKIE_SECURE: true,
      ACCESS_TOKEN_EXPIRY: 600, REFRESH_TOKEN_EXPIRY: 604800, BCRYPT_ROUNDS: 12, LOG_LEVEL: 'info',
    });
    expect(config).not.toHaveProperty('UNRELATED_SECRET');
    expect(source).not.toHaveProperty('PORT');
    expect(Object.isFrozen(config)).toBe(true);
  });

  test.each([
    ['PORT', ''], ['PORT', '0'], ['PORT', '65536'], ['PORT', '5.5'], ['PORT', '1e3'],
    ['NODE_ENV', 'staging'], ['JWT_SECRET', 'short'], ['JWT_SECRET', ' '.repeat(32)],
    ['MONGODB_URI', 'https://example.com/database'], ['MONGODB_URI', 'mongodb://localhost/db'],
    ['MONGODB_URI', 'mongodb://localhost/db?replicaSet='], ['MONGODB_URI', 'mongodb://localhost/db?replicaSet=rs 0'],
    ['CORS_ORIGIN', '*'], ['CORS_ORIGIN', 'https://example.com/path'],
    ['CORS_ORIGIN', 'https://user:password@example.com'], ['CORS_ORIGIN', 'http://example.com'],
    ['CORS_ORIGIN', 'https://example.com?secret=value'], ['CORS_ORIGIN', 'https://example.com/'],
    ['UPLOAD_DIR', 'relative/uploads'], ['UPLOAD_DIR', ''],
    ['COOKIE_SECURE', '0'], ['COOKIE_SECURE', 'False'], ['COOKIE_DOMAIN', 'https://example.com'],
    ['ACCESS_TOKEN_EXPIRY', '601'], ['REFRESH_TOKEN_EXPIRY', '600'], ['BCRYPT_ROUNDS', '10'],
    ['LOG_LEVEL', 'verbose'],
  ])('rejects invalid %s without echoing its value (%s)', (key, value) => {
    expect(() => parseEnv(testEnv({ [key]: value }))).toThrow(`Invalid configuration: ${key}.`);
  });

  test('does not attach raw validation input or a cause to configuration errors', () => {
    const sensitiveInput = 'MUST_NOT_LEAK';
    try {
      parseEnv(testEnv({ JWT_SECRET: sensitiveInput, MONGODB_URI: sensitiveInput }));
    } catch (error) {
      expect(error.message).toBe('Invalid configuration: JWT_SECRET, MONGODB_URI.');
      expect(JSON.stringify(error)).not.toContain(sensitiveInput);
      expect(error).not.toHaveProperty('cause');
    }
  });

  test.each(['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000'])(
    'accepts insecure cookies only for local development at %s', (origin) => {
      expect(parseEnv(testEnv({ NODE_ENV: 'development', COOKIE_SECURE: 'false', CORS_ORIGIN: origin })).COOKIE_SECURE).toBe(false);
    },
  );

  test('rejects insecure production cookies and non-HTTPS production origins', () => {
    expect(() => parseEnv(testEnv({ NODE_ENV: 'production', COOKIE_SECURE: 'false' })))
      .toThrow('Invalid configuration: COOKIE_SECURE, CORS_ORIGIN.');
  });

  test('rejects insecure cookies even on a nonlocal HTTPS development origin', () => {
    expect(() => parseEnv(testEnv({ COOKIE_SECURE: 'false', CORS_ORIGIN: 'https://example.com' })))
      .toThrow('Invalid configuration: COOKIE_SECURE.');
  });

  test('accepts Atlas SRV syntax without connecting and preserves supplied secrets', () => {
    const env = testEnv({
      NODE_ENV: 'production', CORS_ORIGIN: 'https://hostelfix.example.com',
      MONGODB_URI: 'mongodb+srv://fixture:fixture@example.invalid/hostelfix', COOKIE_DOMAIN: '.example.com',
    });
    expect(parseEnv(env)).toMatchObject({ JWT_SECRET: env.JWT_SECRET, COOKIE_SECURE: true, COOKIE_DOMAIN: '.example.com' });
  });

  test('treats an empty cookie domain as the host-only default', () => {
    expect(parseEnv(testEnv({ COOKIE_DOMAIN: '' })).COOKIE_DOMAIN).toBeUndefined();
  });

  test.each([
    undefined, '', 'mongodb://127.0.0.1:27017/hostelfix?replicaSet=rs0',
    'mongodb+srv://example.invalid/hostelfix_test',
    'mongodb://127.0.0.1:27017/hostelfix_test',
    'mongodb://127.0.0.1:27017/hostelfix_test?replicaSet=rs0&tls=false',
    'mongodb://example.invalid:27017/hostelfix_test?replicaSet=rs0',
  ])('test mode rejects an absent or unsafe independent test target: %s', (uri) => {
    expect(() => parseEnv(testEnv({ TEST_MONGODB_URI: uri }))).toThrow('Invalid configuration: TEST_MONGODB_URI.');
  });

  test.each([
    'mongodb://localhost:invalid/hostelfix?replicaSet=rs0',
    'mongodb://localhost/hostelfix?replicaSet=rs0&directConnection=true',
    'mongodb://localhost/hostelfix?replicaSet=rs0&readPreference=secondary',
  ])('rejects malformed or non-primary connection options', (uri) => {
    expect(() => parseEnv(testEnv({ MONGODB_URI: uri }))).toThrow('Invalid configuration: MONGODB_URI.');
  });

  test('requires database authentication in production', () => {
    expect(() => parseEnv(testEnv({ NODE_ENV: 'production', CORS_ORIGIN: 'https://app.example.com',
      MONGODB_URI: 'mongodb+srv://example.invalid/hostelfix' }))).toThrow('Invalid configuration: MONGODB_URI.');
  });
});

describe('explicit environment loading', () => {
  const fixture = path.resolve(__dirname, '../fixtures/config.env');

  test('loads the requested file, respects supplied values, and leaves the source unchanged', () => {
    const source = testEnv({ NODE_ENV: 'development', PORT: '5433' });
    expect(loadEnv({ source, envFile: fixture })).toMatchObject({ PORT: 5433, LOG_LEVEL: 'debug' });
    expect(source).not.toHaveProperty('LOG_LEVEL');
    expect(loadEnv({ source: testEnv({ NODE_ENV: 'development' }), envFile: fixture }).PORT).toBe(5432);
  });

  test('ignores env files in test mode, even when the file would set another port', () => {
    expect(loadEnv({ source: testEnv(), envFile: fixture })).toMatchObject({ PORT: 5000, LOG_LEVEL: 'info' });
  });

  test('allows a missing env file when the supplied configuration is complete', () => {
    expect(loadEnv({ source: testEnv({ NODE_ENV: 'development' }), envFile: path.join(__dirname, 'missing.env') }).PORT).toBe(5000);
  });

  test('reports file read failures without leaking a filesystem path', () => {
    expect(() => loadEnv({ source: testEnv({ NODE_ENV: 'development' }), envFile: __dirname }))
      .toThrow('Invalid configuration: ENV_FILE.');
  });
});
