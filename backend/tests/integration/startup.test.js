const { spawnSync, spawn } = require('node:child_process');
const path = require('node:path');
const request = require('supertest');
const net = require('node:net');
const { EventEmitter, once } = require('node:events');
const { startServer, installShutdownHandlers } = require('../../src/server');
const { testEnv } = require('../helpers/env.helper');
const { verifyLocalTestServer } = require('../helpers/database.helper');

const backendDir = path.resolve(__dirname, '../..');
const close = (server) => server.shutdown();
const dependencies = () => ({
  database: {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    check: vi.fn().mockResolvedValue(undefined),
  },
  storage: {
    prepare: vi.fn().mockResolvedValue(undefined),
    check: vi.fn().mockResolvedValue(undefined),
  },
});
const quietConfig = { PORT: 0, LOG_LEVEL: 'silent' };

function runEntry(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/server.js'], {
      cwd: backendDir,
      env,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Server process did not exit.'));
    }, 10000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

test('fresh app/server imports neither load .env nor open a listener', () => {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `
    require('node:http').Server.prototype.listen = () => { throw Error('Unexpected listener'); };
    require('dotenv').config = () => { throw Error('Unexpected env load'); };
    require('mongoose').Connection.prototype.openUri = () => { throw Error('Unexpected database connection'); };
    const { createApp } = require('./src/app');
    require('./src/server');
    createApp();
    process.stdout.write('imported');
  `,
    ],
    { cwd: backendDir, encoding: 'utf8', timeout: 5000, windowsHide: true }
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout).toBe('imported');
  expect(result.stderr).toBe('');
});

test('starts a real HTTP listener only when explicitly requested', async () => {
  const deps = dependencies();
  const server = await startServer({
    config: quietConfig,
    host: '127.0.0.1',
    ...deps,
  });
  try {
    expect(server.listening).toBe(true);
    await request(server).get('/api/v1/health').expect(200);
    await request(server).get('/api/v1/health/ready').expect(200);
  } finally {
    await close(server);
  }
  expect(server.listening).toBe(false);
  expect(deps.database.disconnect).toHaveBeenCalledOnce();
});

test('CLI fails fast on missing configuration and emits no raw input/stack', async () => {
  const result = await runEntry({
    NODE_ENV: 'test',
    JWT_SECRET: 'MUST_NOT_LEAK',
  });
  expect(result.code).toBe(1);
  expect(result.stdout).toBe('');
  expect(JSON.parse(result.stderr)).toMatchObject({
    level: 50,
    message:
      'Invalid configuration: CORS_ORIGIN, JWT_SECRET, MONGODB_URI, UPLOAD_DIR.',
  });
  expect(result.stderr).not.toContain('MUST_NOT_LEAK');
  expect(JSON.parse(result.stderr)).not.toHaveProperty('stack');
});

test('CLI handles an occupied port safely', async () => {
  const testUri = await verifyLocalTestServer();
  // Use the same wildcard bind as the CLI; Windows can separately bind IPv4/IPv6.
  const server = await startServer({ config: quietConfig, ...dependencies() });
  try {
    const result = await runEntry(
      testEnv({
        PORT: String(server.address().port),
        TEST_MONGODB_URI: testUri,
      })
    );
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      level: 50,
      message: 'HTTP server could not start.',
    });
  } finally {
    await close(server);
  }
}, 15000);

test.each(['database', 'storage'])(
  'cleans up on %s startup failure',
  async (dependency) => {
    const deps = dependencies();
    deps[dependency][
      dependency === 'database' ? 'connect' : 'prepare'
    ].mockRejectedValue(new Error('PRIVATE_FAILURE'));
    await expect(
      startServer({ config: quietConfig, ...deps })
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(deps.database.disconnect).toHaveBeenCalledOnce();
  }
);

test('closes its database connection after an HTTP bind failure', async () => {
  const server = await startServer({
    config: quietConfig,
    host: '127.0.0.1',
    ...dependencies(),
  });
  const deps = dependencies();
  try {
    await expect(
      startServer({
        config: { ...quietConfig, PORT: server.address().port },
        host: '127.0.0.1',
        ...deps,
      })
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(deps.database.disconnect).toHaveBeenCalledOnce();
  } finally {
    await server.shutdown();
  }
});

test('shutdown drains active requests, rejects readiness, and disconnects only once', async () => {
  const deps = dependencies();
  let finishCheck;
  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  deps.database.check.mockImplementation(() => {
    markStarted();
    return new Promise((resolve) => {
      finishCheck = resolve;
    });
  });
  const server = await startServer({
    config: quietConfig,
    host: '127.0.0.1',
    ...deps,
  });
  const response = request(server)
    .get('/api/v1/health/ready')
    .then((res) => res);
  await started;
  const first = server.shutdown();
  expect(server.shutdown()).toBe(first);
  expect(deps.database.disconnect).not.toHaveBeenCalled();
  finishCheck();
  expect((await response).status).toBe(503);
  await first;
  expect(deps.database.disconnect).toHaveBeenCalledOnce();
});

test('shutdown closes a stuck HTTP connection after its drain deadline', async () => {
  const deps = dependencies();
  const server = await startServer({
    config: quietConfig,
    host: '127.0.0.1',
    shutdownMs: 50,
    ...deps,
  });
  const socket = net.connect(server.address().port, '127.0.0.1');
  try {
    await once(socket, 'connect');
    socket.write('GET /api/v1/health HTTP/1.1\r\nHost: localhost\r\n');
    await new Promise((resolve) => setTimeout(resolve, 20));
    const closed = once(socket, 'close');
    await server.shutdown();
    await closed;
    expect(deps.database.disconnect).toHaveBeenCalledOnce();
  } finally {
    socket.destroy();
    await server.shutdown();
  }
});

test.each(['SIGINT', 'SIGTERM'])(
  '%s triggers idempotent shutdown and removes handlers',
  async (signal) => {
    const signals = new EventEmitter();
    const deps = dependencies();
    const server = await startServer({ config: quietConfig, ...deps });
    installShutdownHandlers(server, { signals });
    signals.emit(signal);
    signals.emit(signal);
    await server.shutdown();
    await new Promise((resolve) => setImmediate(resolve));
    expect(deps.database.disconnect).toHaveBeenCalledOnce();
    expect(signals.listenerCount('SIGINT')).toBe(0);
    expect(signals.listenerCount('SIGTERM')).toBe(0);
  }
);

test('shutdown errors are safe and produce a failure exit status', async () => {
  const signals = new EventEmitter();
  signals.exit = vi.fn();
  const logger = { info: vi.fn(), error: vi.fn() };
  installShutdownHandlers(
    {
      shutdown: async () => {
        throw new Error('PRIVATE');
      },
    },
    { signals, logger }
  );
  signals.emit('SIGTERM');
  await new Promise((resolve) => setImmediate(resolve));
  expect(signals.exitCode).toBe(1);
  expect(signals.exit).toHaveBeenCalledWith(1);
  expect(JSON.stringify(logger.error.mock.calls)).not.toContain('PRIVATE');
});
