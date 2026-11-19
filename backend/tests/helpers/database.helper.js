const { MongoClient } = require('mongodb');
const { member } = require('../../../scripts/mongodb/safety');
const { verifyServer } = require('../../../scripts/mongodb/safety');
const {
  isTestDatabaseUri,
  LOCAL_TEST_URI,
} = require('../../src/config/testDatabase');
const { ConfigurationError } = require('../../src/config/env');

async function verifyLocalTestServer() {
  const uri = process.env.TEST_MONGODB_URI ?? LOCAL_TEST_URI;
  if (!isTestDatabaseUri(uri))
    throw new ConfigurationError(['TEST_MONGODB_URI']);
  // Check ownership and membership via the fixed direct socket before discovery
  // or any test writes. Never read a real .env file in the backend test runner.
  const client = new MongoClient(
    `mongodb://${member}/admin?directConnection=true`,
    {
      serverSelectionTimeoutMS: 2000,
      socketTimeoutMS: 2000,
    }
  );
  try {
    await client.connect();
    await verifyServer(client);
  } catch {
    throw new Error(
      'Project-local rs0 is unavailable or unowned. Run scripts/mongodb/start.ps1 and status.ps1.'
    );
  } finally {
    await client.close();
  }
  return uri;
}

module.exports = { verifyLocalTestServer };
