const path = require('node:path');
const { createRequire } = require('node:module');
const { root } = require('./project-config');
const service = process.argv[2];
async function main() {
  if (!process.send)
    throw new Error(
      'Managed services must be started by the project supervisor.'
    );
  if (service === 'backend') {
    const { startServer } = require('../backend/src/server');
    const server = await startServer({ host: '127.0.0.1' });
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      try {
        await server.shutdown();
        process.exit(0);
      } catch {
        process.exit(1);
      }
    };
    process.on('message', (message) => {
      if (message === 'stop') void stop();
    });
    process.once('SIGINT', () => {
      void stop();
    });
    process.once('SIGTERM', () => {
      void stop();
    });
    process.send({ type: 'ready', service, pid: process.pid });
  } else if (service === 'frontend') {
    process.env.NODE_ENV =
      process.env.HOSTELFIX_FRONTEND_MODE === 'dev'
        ? 'development'
        : 'production';
    process.env.NEXT_RUNTIME = 'nodejs';
    process.env.NEXT_PRIVATE_START_TIME = String(Date.now());
    if (process.env.HOSTELFIX_FRONTEND_MODE === 'dev') {
      process.env.TURBOPACK ??= 'auto';
      process.env.__NEXT_DEV_SERVER = '1';
    }
    process.chdir(path.join(root, 'frontend'));
    const frontendRequire = createRequire(
      path.join(root, 'frontend/package.json')
    );
    // Use the same native server/router as next dev/start, with its own graceful
    // cleanup. IPC lets the supervisor request that cleanup on Windows too.
    const { startServer } = frontendRequire(
      'next/dist/server/lib/start-server'
    );
    await startServer({
      dir: path.join(root, 'frontend'),
      port: Number(process.env.HOSTELFIX_FRONTEND_PORT),
      hostname: 'localhost',
      isDev: process.env.HOSTELFIX_FRONTEND_MODE === 'dev',
      allowRetry: false,
    });
    process.on('message', (message) => {
      if (message === 'stop') process.emit('SIGTERM', 'SIGTERM');
    });
    process.send({ type: 'ready', service, pid: process.pid });
  } else throw new Error('Unknown managed service.');
  process.on('disconnect', () => {
    process.emit('message', 'stop');
  });
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
