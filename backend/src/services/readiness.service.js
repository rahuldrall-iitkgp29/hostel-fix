const { unavailable } = require('../utils/AppError');
const { withTimeout } = require('../utils/withTimeout');

function createReadiness({
  database,
  storage,
  isShuttingDown = () => false,
  timeoutMs = 1000,
} = {}) {
  return async () => {
    if (!database || !storage || isShuttingDown()) throw unavailable();
    try {
      await withTimeout(
        () => Promise.all([database.check(), storage.check()]),
        timeoutMs
      );
      if (isShuttingDown()) throw unavailable();
    } catch {
      throw unavailable();
    }
  };
}

module.exports = { createReadiness };
