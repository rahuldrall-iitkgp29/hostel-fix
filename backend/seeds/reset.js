const { databaseUri, createDatabase } = require('../src/config/database');
const { LOCAL_TEST_URI } = require('../src/config/testDatabase');
const { createModels } = require('../src/models');
const { seedDatabase } = require('./index');
const { cleanupOwned, LOCAL_DEV_URI } = require('./ownership');
function guardResetTarget(config) {
  if (config.NODE_ENV === 'production')
    throw new Error('Database reset is strictly forbidden in production.');
  const uri = databaseUri(config);
  if (uri !== LOCAL_TEST_URI && uri !== LOCAL_DEV_URI)
    throw new Error(
      'Reset is strictly restricted to local development or test databases.'
    );
  return uri;
}
async function resetDatabase({ config, database: providedDb }) {
  guardResetTarget(config);
  if (config.NODE_ENV !== 'test')
    throw new Error('Use reset:demo for owned development demo records.');
  const database = providedDb ?? createDatabase(config);
  if (!database.connection.$legacySeedOwner)
    throw new Error(
      'Legacy seed ownership cannot be established; refusing cleanup.'
    );
  const models = createModels(database.connection);
  if (
    !Object.values(models).every((Model) =>
      /^seed_[a-f\d]{32}_/.test(Model.collection.name)
    )
  )
    throw new Error('Reset requires isolated fixture collections.');
  await cleanupOwned({
    config,
    database,
    models,
    owner: database.connection.$legacySeedOwner,
    fixture: true,
  });
  return seedDatabase({ config, database, models });
}
if (require.main === module) require('./demo-cli').main('reset');
module.exports = { resetDatabase, guardResetTarget, LOCAL_DEV_URI };
