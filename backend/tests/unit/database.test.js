const { EventEmitter } = require('node:events');
const { createDatabase, databaseUri } = require('../../src/config/database');
const { LOCAL_TEST_URI } = require('../../src/config/testDatabase');
const { parseEnv } = require('../../src/config/env');
const { testEnv } = require('../helpers/env.helper');

function fixture(hello = {}) {
  const connection = new EventEmitter();
  connection.readyState = 0;
  const command = vi
    .fn()
    .mockResolvedValue({
      setName: 'rs0',
      isWritablePrimary: true,
      logicalSessionTimeoutMinutes: 30,
      maxWireVersion: 25,
      ...hello,
    });
  connection.db = {
    admin: () => ({ command }),
    command: vi.fn().mockResolvedValue({ ok: 1 }),
  };
  connection.openUri = vi.fn(async () => {
    connection.readyState = 1;
  });
  connection.close = vi.fn(async () => {
    connection.readyState = 0;
  });
  return { connection, command };
}

test('test connections select only the independently guarded test URI', () => {
  expect(
    databaseUri({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb+srv://production.invalid/live',
      TEST_MONGODB_URI: LOCAL_TEST_URI,
    })
  ).toBe(LOCAL_TEST_URI);
  for (const uri of [
    undefined,
    '',
    'mongodb://127.0.0.1:27017/hostelfix?replicaSet=rs0',
    'mongodb+srv://remote.invalid/hostelfix_test',
  ]) {
    expect(() =>
      databaseUri({
        NODE_ENV: 'test',
        MONGODB_URI: LOCAL_TEST_URI,
        TEST_MONGODB_URI: uri,
      })
    ).toThrow('TEST_MONGODB_URI');
  }
});

test.each(['development', 'test', 'production'])(
  'connect lifecycle and index policy in %s',
  async (mode) => {
    const { connection, command } = fixture();
    const config = parseEnv(
      testEnv({ NODE_ENV: mode, CORS_ORIGIN: 'https://app.example.com' })
    );
    const db = createDatabase(config, { connection });
    await expect(db.check()).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    await Promise.all([db.connect(), db.connect()]);
    await db.connect();
    expect(connection.openUri).toHaveBeenCalledOnce();
    expect(connection.openUri.mock.calls[0][1]).toMatchObject({
      autoIndex: mode !== 'production',
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
      timeoutMS: 5000,
    });
    expect(command).toHaveBeenCalledWith({ hello: 1 }, { timeoutMS: 5000 });
    await db.check();
    await db.disconnect();
    expect(connection.close).toHaveBeenCalledOnce();
    await expect(db.check()).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  }
);

test.each([
  { setName: undefined },
  { isWritablePrimary: false },
  { logicalSessionTimeoutMinutes: null },
  { maxWireVersion: 6 },
])(
  'rejects a topology without transaction-capable primary: %j',
  async (hello) => {
    const { connection } = fixture(hello);
    const db = createDatabase(parseEnv(testEnv()), { connection });
    await expect(db.connect()).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(connection.close).toHaveBeenCalledOnce();
  }
);

test('driver failures and events never expose raw credentials/paths', async () => {
  const { connection } = fixture();
  const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
  connection.openUri.mockRejectedValue(
    new Error('PRIVATE database password path')
  );
  const db = createDatabase(parseEnv(testEnv()), { connection, logger });
  await expect(db.connect()).rejects.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    message: 'Service is temporarily unavailable.',
  });
  connection.emit('error', new Error('PRIVATE'));
  connection.emit('disconnected');
  expect(
    JSON.stringify([logger.error.mock.calls, logger.warn.mock.calls])
  ).not.toContain('PRIVATE');
});

test('failed ping and failed disconnect expose only safe errors', async () => {
  const { connection } = fixture();
  const db = createDatabase(parseEnv(testEnv()), { connection });
  await db.connect();
  connection.db.command.mockRejectedValue(new Error('PRIVATE'));
  await expect(db.check()).rejects.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
  });
  connection.close.mockRejectedValue(new Error('PRIVATE'));
  await expect(db.disconnect()).rejects.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
  });
  await expect(db.check()).rejects.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
  });
});
