const { spawn } = require('node:child_process');
const { configuration } = require('./project-config');
async function inspect(settings) {
  if (settings.production) {
    const { createDatabase } = require('../backend/src/config/database');
    const db = createDatabase(settings.config);
    try {
      await db.connect();
      await db.check();
      return {
        running: true,
        owned: false,
        external: true,
        database: db.connection.name,
      };
    } finally {
      await db.disconnect();
    }
  }
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(
    `mongodb://127.0.0.1:${settings.mongoPort}/admin?directConnection=true`,
    { serverSelectionTimeoutMS: 1000, socketTimeoutMS: 1000 }
  );
  try {
    await client.connect();
    const safety = require('./mongodb/safety');
    await safety.verifyServer(client);
    await client.db('hostelfix').command({ ping: 1 });
    return {
      running: true,
      owned: true,
      port: settings.mongoPort,
      replicaSet: 'rs0',
      database: 'hostelfix',
    };
  } catch (error) {
    if (
      error.name === 'MongoServerSelectionError' &&
      error.message.includes('ECONNREFUSED')
    )
      return { running: false, owned: false, port: settings.mongoPort };
    throw new Error(
      'Database is unavailable or ownership cannot be verified; no process or data was modified.'
    );
  } finally {
    await client.close();
  }
}
function manage(action, settings) {
  if (settings.production)
    throw new Error(
      'Project-local MongoDB management is unavailable in production.'
    );
  if (process.platform !== 'win32')
    throw new Error(
      'The existing portable MongoDB manager requires Windows. No database process was modified.'
    );
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        require('node:path').join(
          settings.root,
          `scripts/mongodb/${action}.ps1`
        ),
      ],
      { env: settings.childEnv, stdio: 'inherit', windowsHide: true }
    );
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Database ${action} failed (${code}).`))
    );
  });
}
async function ensure(settings) {
  if (settings.production) return false;
  const before = await inspect(settings);
  if (before.running) return false;
  await manage('start', settings);
  await inspect(settings);
  return true;
}
async function main(action) {
  const settings = configuration();
  // All tools must resolve the same explicit owned port before loading guards.
  process.env.HOSTELFIX_TEST_PORT = String(settings.mongoPort);
  if (action === 'status' || action === 'health') {
    const status = await inspect(settings);
    console.log(JSON.stringify(status, null, 2));
    if (action === 'health' && !status.running) process.exitCode = 1;
  } else
    await manage(action === 'init' ? 'init-replica-set' : action, settings);
}
if (require.main === module)
  main(process.argv[2] || 'status').catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { inspect, ensure, manage, main };
