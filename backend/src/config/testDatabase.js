// A dedicated target is mandatory in test mode. Never fall back to MONGODB_URI.
const LOCAL_TEST_URI = 'mongodb://127.0.0.1:27017/hostelfix_test?replicaSet=rs0';
const isTestDatabaseUri = (uri) => uri === LOCAL_TEST_URI;

module.exports = { LOCAL_TEST_URI, isTestDatabaseUri };
