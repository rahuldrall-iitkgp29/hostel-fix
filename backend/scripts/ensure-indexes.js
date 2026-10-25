const { ConfigurationError, loadEnv } = require('../src/config/env');
const { createDatabase } = require('../src/config/database');
const { createModels, ensureIndexes } = require('../src/models');

async function ensureDatabaseIndexes({
  config,
  database = createDatabase(config),
}) {
  try {
    await database.connect();
    const models = createModels(database.connection);
    await ensureIndexes(models);
    return Object.keys(models).length;
  } finally {
    await database.disconnect();
  }
}

async function main() {
  try {
    const count = await ensureDatabaseIndexes({ config: loadEnv() });
    process.stdout.write(`Indexes ensured for ${count} models.\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof ConfigurationError ? error.message : 'Database indexes could not be ensured.'}\n`
    );
    process.exitCode = 1;
  }
}

if (require.main === module) void main();
module.exports = { ensureDatabaseIndexes };
