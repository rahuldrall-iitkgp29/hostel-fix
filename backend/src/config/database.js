const mongoose = require('mongoose');
const { ConfigurationError } = require('./env');
const { isTestDatabaseUri } = require('./testDatabase');
const { unavailable } = require('../utils/AppError');
const { withTimeout } = require('../utils/withTimeout');

function databaseUri(config) {
  if (config.NODE_ENV === 'test') {
    if (!isTestDatabaseUri(config.TEST_MONGODB_URI))
      throw new ConfigurationError(['TEST_MONGODB_URI']);
    return config.TEST_MONGODB_URI;
  }
  return config.MONGODB_URI;
}

function createDatabase(
  config,
  { logger, connection = mongoose.createConnection(), timeoutMs = 5000 } = {}
) {
  const uri = databaseUri(config);
  let connecting;
  let closing = false;
  connection.on('error', () =>
    logger?.error({ event: 'database_error' }, 'Database unavailable.')
  );
  connection.on('disconnected', () =>
    logger?.warn({ event: 'database_disconnected' }, 'Database disconnected.')
  );

  async function connect() {
    if (connecting) return connecting;
    if (!closing && connection.readyState === 1) return connection;
    closing = false;
    connecting = (async () => {
      try {
        await connection.openUri(uri, {
          autoIndex: config.NODE_ENV !== 'production',
          bufferCommands: false,
          serverSelectionTimeoutMS: timeoutMs,
          connectTimeoutMS: timeoutMs,
          socketTimeoutMS: timeoutMs,
        });
        const hello = await withTimeout(
          () =>
            connection.db
              .admin()
              .command({ hello: 1 }, { maxTimeMS: timeoutMs }),
          timeoutMs
        );
        if (
          !hello.setName ||
          !hello.isWritablePrimary ||
          hello.logicalSessionTimeoutMinutes == null ||
          hello.maxWireVersion < 7
        ) {
          throw unavailable();
        }
        logger?.info({ event: 'database_connected' }, 'Database connected.');
        return connection;
      } catch {
        await connection.close().catch(() => {});
        throw unavailable();
      } finally {
        connecting = undefined;
      }
    })();
    return connecting;
  }

  async function check() {
    if (closing || connection.readyState !== 1) throw unavailable();
    try {
      await withTimeout(
        () => connection.db.command({ ping: 1 }, { maxTimeMS: 1000 }),
        1000
      );
    } catch {
      throw unavailable();
    }
  }

  async function disconnect() {
    closing = true;
    try {
      if (connecting) await connecting.catch(() => {});
      await connection.close();
    } catch {
      throw unavailable();
    }
  }

  return { connect, disconnect, check, connection };
}

module.exports = { createDatabase, databaseUri };
