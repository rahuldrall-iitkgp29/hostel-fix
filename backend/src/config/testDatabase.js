// A dedicated target is mandatory in test mode. Never fall back to MONGODB_URI.
// Alternate ports still require checkout ownership before any test writes.
const TEST_PORT = process.env.HOSTELFIX_TEST_PORT ?? '27017';
if (
  !/^\d+$/.test(TEST_PORT) ||
  Number(TEST_PORT) < 1024 ||
  Number(TEST_PORT) > 65535
)
  throw new Error('Invalid HOSTELFIX_TEST_PORT.');
const LOCAL_TEST_URI = `mongodb://127.0.0.1:${TEST_PORT}/hostelfix_test?replicaSet=rs0`;
const isTestDatabaseUri = (uri) => uri === LOCAL_TEST_URI;

module.exports = { LOCAL_TEST_URI, isTestDatabaseUri, TEST_PORT };
