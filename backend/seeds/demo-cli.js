const { configuration } = require('../../scripts/project-config');
const db = require('../../scripts/database');
async function main(action = process.argv[2] || 'seed') {
  const settings = configuration();
  if (
    settings.production ||
    settings.config.NODE_ENV !== 'development' ||
    settings.explicitEnvironment !== 'development'
  )
    throw new Error(
      'Demo commands require an explicit development environment; production is forbidden.'
    );
  const { loadEnv } = require('../src/config/env');
  const { createDatabase } = require('../src/config/database');
  const { createModels } = require('../src/models');
  const {
    seedDemo,
    localOwner,
    summary,
    credentials,
    writeDocumentation,
  } = require('./demo');
  const { cleanupOwned } = require('./ownership');
  await db.ensure(settings);
  const database = createDatabase(loadEnv({ source: settings.childEnv }));
  try {
    await database.connect();
    if (action === 'seed' || action === 'reset') {
      const result = await seedDemo({
        config: loadEnv({ source: settings.childEnv }),
        database,
        reset: action === 'reset',
      });
      console.log(JSON.stringify(result.result, null, 2));
      console.log('Development logins: DEMO.md (local only).');
    } else {
      const models = createModels(database.connection);
      const owner = await localOwner(database, { create: false });
      if (action === 'clean')
        console.log(
          `Removed ${await cleanupOwned({ config: loadEnv({ source: settings.childEnv }), database, models, owner })} explicitly registered demo records.`
        );
      else if (action === 'verify')
        console.log(
          JSON.stringify(
            await require('./verify-demo').verifyDemo({
              database,
              models,
              owner,
            }),
            null,
            2
          )
        );
      else if (action === 'logins') {
        const manifest = await database.connection.db
          .collection(require('../src/models/demoOwnership').REGISTRY)
          .findOne({ _id: owner });
        if (!manifest || manifest.status !== 'ready')
          throw new Error(
            'Seed the demo before requesting login documentation.'
          );
        const passwords = await credentials({}, { create: false });
        if (
          require('node:crypto')
            .createHash('sha256')
            .update(JSON.stringify(passwords))
            .digest('hex') !== manifest.passwordFingerprint
        )
          throw new Error(
            'Local demo credentials do not match the seeded passwords. Run reset:demo to apply them.'
          );
        await writeDocumentation(
          require('./demo-plan').makePlan(owner, manifest.generatedAt),
          passwords,
          await summary(models, owner)
        );
        console.log('Development logins: DEMO.md (local only).');
      } else throw new Error('Unknown demo command.');
    }
  } finally {
    await database.disconnect();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { main };
