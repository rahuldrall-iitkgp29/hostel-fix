const path = require('node:path');
const { LOCAL_TEST_URI } = require('../../src/config/testDatabase');

function testEnv(overrides = {}) {
  return {
    ...(process.env.HOSTELFIX_TEST_PORT
      ? { HOSTELFIX_TEST_PORT: process.env.HOSTELFIX_TEST_PORT }
      : {}),
    NODE_ENV: 'test',
    MONGODB_URI:
      overrides.NODE_ENV === 'production'
        ? 'mongodb://fixture:fixture@example.invalid/hostelfix?replicaSet=rs0'
        : LOCAL_TEST_URI,
    TEST_MONGODB_URI: LOCAL_TEST_URI,
    JWT_SECRET: 'fixture-only-not-a-real-secret-32-bytes',
    CORS_ORIGIN: 'http://localhost:3000',
    UPLOAD_DIR: path.resolve(__dirname, '../../.local/test-uploads'),
    ...overrides,
  };
}

module.exports = { testEnv };
