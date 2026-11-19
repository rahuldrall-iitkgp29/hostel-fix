const { createApp } = require('./app');
const { ConfigurationError, loadEnv } = require('./config/env');
const { createDatabase } = require('./config/database');
const { createStorage } = require('./config/storage');
const { createLogger } = require('./config/logger');
const { unavailable } = require('./utils/AppError');
const { withTimeout } = require('./utils/withTimeout');
const { createModels, verifyIndexes } = require('./models');
const { startUploadCleanup } = require('./services/uploadCleanup.service');

async function startServer({
  config = loadEnv(),
  host,
  logger = createLogger(config),
  database = createDatabase(config, { logger }),
  storage = createStorage(config),
  shutdownMs = 5000,
} = {}) {
  let shuttingDown = false;
  let shutdownPromise;
  let server;
  let stopCleanup;
  try {
    await database.connect();
    if (config.NODE_ENV === 'production')
      await verifyIndexes(createModels(database.connection));
    await withTimeout(() => storage.prepare(), 5000);
    const app = createApp({
      config,
      database,
      storage,
      logger,
      isShuttingDown: () => shuttingDown,
    });
    server = await new Promise((resolve, reject) => {
      const listener = app.listen(config.PORT, host);
      listener.once('error', reject);
      listener.once('listening', () => {
        listener.removeListener('error', reject);
        resolve(listener);
      });
    });
    if (database.connection?.readyState === 1)
      stopCleanup = startUploadCleanup({
        config,
        models: createModels(database.connection),
        logger,
      });
  } catch {
    await database.disconnect().catch(() => {});
    throw unavailable();
  }

  server.shutdown = () => {
    if (shutdownPromise) return shutdownPromise;
    shuttingDown = true;
    shutdownPromise = (async () => {
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => server.closeAllConnections(),
            shutdownMs
          );
          server.close((error) => {
            clearTimeout(timer);
            if (error) reject(error);
            else resolve();
          });
        });
      } finally {
        if (stopCleanup)
          await withTimeout(stopCleanup, shutdownMs).catch(() => {});
        await withTimeout(() => database.disconnect(), shutdownMs);
      }
    })().catch(() => {
      throw unavailable();
    });
    return shutdownPromise;
  };
  return server;
}

function installShutdownHandlers(server, { signals = process, logger } = {}) {
  let stopping = false;
  const cleanup = () => {
    signals.removeListener('SIGINT', stop);
    signals.removeListener('SIGTERM', stop);
  };
  async function stop() {
    if (stopping) return;
    stopping = true;
    logger?.info({ event: 'shutdown_started' }, 'Server shutting down.');
    try {
      await server.shutdown();
      logger?.info({ event: 'shutdown_complete' }, 'Server stopped.');
    } catch {
      signals.exitCode = 1;
      logger?.error({ event: 'shutdown_failed' }, 'Server shutdown failed.');
      // A stalled driver must not leave the executable alive indefinitely.
      signals.exit?.(1);
    } finally {
      cleanup();
    }
  }
  signals.on('SIGINT', stop);
  signals.on('SIGTERM', stop);
  return cleanup;
}

async function main() {
  try {
    const config = loadEnv();
    const logger = createLogger(config);
    const server = await startServer({ config, logger });
    installShutdownHandlers(server, { logger });
    logger.info({ port: server.address().port }, 'HTTP server listening.');
  } catch (error) {
    const message =
      error instanceof ConfigurationError
        ? error.message
        : 'HTTP server could not start.';
    // Even invalid LOG_LEVEL/configuration must produce a safe diagnostic.
    createLogger({ LOG_LEVEL: 'error' }, process.stderr).error(
      { message },
      'Startup failed.'
    );
    process.exitCode = 1;
  }
}

if (require.main === module) void main();

module.exports = { startServer, installShutdownHandlers };
