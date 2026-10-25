const { loadEnv } = require('../src/config/env');
const { createDatabase, databaseUri } = require('../src/config/database');
const { LOCAL_TEST_URI } = require('../src/config/testDatabase');
const { createModels, ensureIndexes } = require('../src/models');
const { seedDatabase } = require('./index');

const LOCAL_DEV_URI = 'mongodb://127.0.0.1:27017/hostelfix?replicaSet=rs0';

function guardResetTarget(config) {
  if (config.NODE_ENV === 'production') {
    throw new Error('Database reset is strictly forbidden in production.');
  }
  const uri = databaseUri(config);
  if (uri !== LOCAL_TEST_URI && uri !== LOCAL_DEV_URI) {
    throw new Error(
      `Reset is strictly restricted to local development or test databases (${LOCAL_DEV_URI} or ${LOCAL_TEST_URI}). Refusing target: ${uri}`
    );
  }
  return uri;
}

async function resetDatabase({ config, database: providedDb }) {
  guardResetTarget(config);
  const database = providedDb ?? createDatabase(config);
  let localConnect = false;
  if (database.connection.readyState !== 1) {
    await database.connect();
    localConnect = true;
  }
  try {
    const models = createModels(database.connection);
    // Drop all model collections safely
    const collections = await database.connection.db
      .listCollections()
      .toArray();
    const collectionNames = collections
      .map((c) => c.name)
      .filter((name) => !name.startsWith('system.'));
    for (const name of collectionNames) {
      await database.connection.db
        .collection(name)
        .drop()
        .catch(() => {});
    }
    await ensureIndexes(models);
    return await seedDatabase({ config, database, models });
  } finally {
    if (localConnect) {
      await database.disconnect();
    }
  }
}

async function main() {
  const config = loadEnv();
  try {
    await resetDatabase({ config });
    process.stdout.write('Database reset and seeded successfully.\n');
  } catch (error) {
    process.stderr.write(`Reset failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) void main();
module.exports = { resetDatabase, guardResetTarget, LOCAL_DEV_URI };
