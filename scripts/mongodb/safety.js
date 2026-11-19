const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const projectRoot = path.resolve(__dirname, '../..');
const backendRequire = createRequire(
  path.join(projectRoot, 'backend/package.json')
);
const { parse } = backendRequire('dotenv');
const { TEST_PORT } = backendRequire('./src/config/testDatabase');
const localDirectory =
  TEST_PORT === '27017' ? '.local' : `.local/mongodb-test-${TEST_PORT}`;
const dataDirectory = path.join(projectRoot, localDirectory, 'mongodb-data');
const configPath = path.join(
  projectRoot,
  localDirectory,
  'mongodb-runtime/mongod.cfg'
);
const statePath = path.join(
  projectRoot,
  localDirectory,
  'mongodb-runtime/instance.json'
);
const executable = path.join(
  projectRoot,
  'tools/mongodb/mongodb-win32-x86_64-windows-8.0.34/bin/mongod.exe'
);
const member = `127.0.0.1:${TEST_PORT}`;
const expectedUris = Object.freeze({
  MONGODB_URI: `mongodb://${member}/hostelfix?replicaSet=rs0`,
  TEST_MONGODB_URI: `mongodb://${member}/hostelfix_test?replicaSet=rs0`,
});

class SetupError extends Error {}
function ensure(condition, message) {
  if (!condition) throw new SetupError(message);
}
const samePath = (left, right) =>
  typeof left === 'string' &&
  path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();

function validateUris(values) {
  for (const key of Object.keys(expectedUris)) {
    ensure(
      values[key] === expectedUris[key],
      `${key} must be the exact documented local target; refusing missing, remote, credentialed, or alternate database/options.`
    );
  }
  return {
    MONGODB_URI: values.MONGODB_URI,
    TEST_MONGODB_URI: values.TEST_MONGODB_URI,
  };
}

function loadLocalUris(source = process.env) {
  const envFile = path.join(projectRoot, 'backend/.env');
  ensure(
    fs.existsSync(envFile),
    'backend/.env is missing. Configure the two local database URIs from README.'
  );
  const file = parse(fs.readFileSync(envFile));
  const values = {};
  for (const key of Object.keys(expectedUris))
    values[key] = source[key] === undefined ? file[key] : source[key];
  return validateUris(values);
}

function validateOwnership(state, parsed, serverStatus) {
  ensure(
    samePath(state.projectRoot, projectRoot) &&
      samePath(state.executable, executable) &&
      samePath(state.configPath, configPath),
    'Ownership record does not belong to this checkout.'
  );
  ensure(
    Number.isInteger(state.pid) && serverStatus.pid === state.pid,
    'MongoDB PID does not match the project ownership record.'
  );
  ensure(
    samePath(parsed.storage?.dbPath, dataDirectory),
    'MongoDB data directory does not belong to this checkout.'
  );
  ensure(
    samePath(
      parsed.systemLog?.path,
      path.join(projectRoot, localDirectory, 'mongodb-logs/mongod.log')
    ),
    'MongoDB log path does not belong to this checkout.'
  );
  ensure(
    parsed.net?.bindIp === '127.0.0.1' && parsed.net.port === Number(TEST_PORT),
    'MongoDB is not bound exclusively to the configured loopback endpoint.'
  );
  // getCmdLineOpts reports --replSet as replSet, and YAML as replSetName.
  const replication = parsed.replication;
  ensure(
    replication &&
      (replication.replSetName ?? replication.replSet) === 'rs0' &&
      (replication.replSet === undefined || replication.replSet === 'rs0'),
    'MongoDB was not started as replica set rs0.'
  );
}

function validateReplicaConfig(config) {
  ensure(
    config._id === 'rs0' &&
      config.members?.length === 1 &&
      config.members[0].host === member,
    'Unexpected replica-set configuration; no automatic reconfiguration is permitted.'
  );
}

async function verifyServer(client, { primary = true } = {}) {
  ensure(
    fs.existsSync(statePath),
    'Project ownership record is missing; use the PowerShell start script.'
  );
  const state = JSON.parse(
    fs.readFileSync(statePath, 'utf8').replace(/^\uFEFF/, '')
  );
  const admin = client.db('admin');
  const [{ parsed }, serverStatus] = await Promise.all([
    admin.command({ getCmdLineOpts: 1 }),
    admin.command({ serverStatus: 1 }),
  ]);
  validateOwnership(state, parsed, serverStatus);
  if (primary) {
    const { config } = await admin.command({ replSetGetConfig: 1 });
    validateReplicaConfig(config);
    const hello = await admin.command({ hello: 1 });
    ensure(
      hello.setName === 'rs0' && hello.isWritablePrimary === true,
      'rs0 PRIMARY is not available. Run init-replica-set.ps1 or inspect local logs.'
    );
  }
  return { parsed, serverStatus };
}

module.exports = {
  SetupError,
  ensure,
  projectRoot,
  dataDirectory,
  configPath,
  statePath,
  executable,
  expectedUris,
  member,
  validateUris,
  loadLocalUris,
  validateOwnership,
  validateReplicaConfig,
  verifyServer,
};
