const assert = require('node:assert/strict');
const path = require('node:path');
const {
  SetupError,
  projectRoot,
  dataDirectory,
  configPath,
  executable,
  expectedUris,
  member,
  validateUris,
  validateOwnership,
  validateReplicaConfig,
} = require('./safety');

let passed = 0;
function check(name, run) {
  run();
  passed += 1;
  console.log(`PASS: ${name}`);
}
check('exact separate local development/test URIs', () =>
  assert.deepEqual(validateUris(expectedUris), expectedUris)
);
for (const [name, value] of [
  ['missing', undefined],
  ['empty', ''],
  ['development database', expectedUris.MONGODB_URI],
  ['Atlas/SRV', 'mongodb+srv://private.invalid/hostelfix_test'],
  [
    'remote host',
    'mongodb://private.invalid:27017/hostelfix_test?replicaSet=rs0',
  ],
  [
    'credentials',
    'mongodb://user:DO_NOT_PRINT@127.0.0.1:27017/hostelfix_test?replicaSet=rs0',
  ],
  ['wrong replica set', expectedUris.TEST_MONGODB_URI.replace('rs0', 'rs1')],
  ['no replica set', expectedUris.TEST_MONGODB_URI.split('?')[0]],
  [
    'alternate port',
    expectedUris.TEST_MONGODB_URI.replace(
      member,
      `127.0.0.1:${Number(member.split(':')[1]) === 65535 ? 65534 : Number(member.split(':')[1]) + 1}`
    ),
  ],
  [
    'extra options',
    `${expectedUris.TEST_MONGODB_URI}&proxyHost=private.invalid`,
  ],
]) {
  check(`reject ${name} test URI before connection`, () => {
    assert.throws(
      () => validateUris({ ...expectedUris, TEST_MONGODB_URI: value }),
      (error) =>
        error instanceof SetupError && !error.message.includes('DO_NOT_PRINT')
    );
  });
}
check('reject nonlocal development URI before connection', () =>
  assert.throws(
    () =>
      validateUris({
        ...expectedUris,
        MONGODB_URI: 'mongodb+srv://private.invalid/production',
      }),
    SetupError
  )
);
const state = { pid: 123, projectRoot, executable, configPath };
const parsed = {
  storage: { dbPath: dataDirectory },
  systemLog: {
    path: path.join(path.dirname(dataDirectory), 'mongodb-logs/mongod.log'),
  },
  net: { bindIp: '127.0.0.1', port: Number(member.split(':')[1]) },
  replication: { replSetName: 'rs0' },
};
check('accept owned local process configuration', () =>
  validateOwnership(state, parsed, { pid: 123 })
);
check('accept verified rs0 command-line option representation', () =>
  validateOwnership(
    state,
    { ...parsed, replication: { replSet: 'rs0' } },
    { pid: 123 }
  )
);
check('reject conflicting replica-set options', () =>
  assert.throws(
    () =>
      validateOwnership(
        state,
        { ...parsed, replication: { replSetName: 'rs0', replSet: 'other' } },
        { pid: 123 }
      ),
    SetupError
  )
);
check('reject another process PID', () =>
  assert.throws(
    () => validateOwnership(state, parsed, { pid: 456 }),
    SetupError
  )
);
check('reject another checkout data directory', () =>
  assert.throws(
    () =>
      validateOwnership(
        state,
        {
          ...parsed,
          storage: { dbPath: path.join(projectRoot, 'other-project-data') },
        },
        { pid: 123 }
      ),
    SetupError
  )
);
check('reject public network binding', () =>
  assert.throws(
    () =>
      validateOwnership(
        state,
        {
          ...parsed,
          net: { bindIp: '0.0.0.0', port: Number(member.split(':')[1]) },
        },
        { pid: 123 }
      ),
    SetupError
  )
);
check('accept one local rs0 member', () =>
  validateReplicaConfig({ _id: 'rs0', members: [{ host: member }] })
);
check('reject unexpected replica-set members', () =>
  assert.throws(
    () =>
      validateReplicaConfig({
        _id: 'rs0',
        members: [{ host: member }, { host: 'remote.invalid:27017' }],
      }),
    SetupError
  )
);
check('reject another replica set', () =>
  assert.throws(
    () =>
      validateReplicaConfig({
        _id: 'other',
        members: [{ host: member }],
      }),
    SetupError
  )
);
console.log(
  `${passed} safety checks passed; no database connection or write performed.`
);
