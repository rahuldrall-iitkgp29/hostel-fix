const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { unavailable } = require('../utils/AppError');

function createStorage(config, { filesystem = fs } = {}) {
  let pending;
  async function probe() {
    const file = path.join(config.UPLOAD_DIR, `.readiness-${randomUUID()}`);
    let handle;
    try {
      handle = await filesystem.open(file, 'wx+', 0o600);
      await handle.writeFile('ready');
      const buffer = Buffer.alloc(5);
      const { bytesRead } = await handle.read(buffer, 0, 5, 0);
      if (bytesRead !== 5 || buffer.toString() !== 'ready') throw unavailable();
    } finally {
      // Remove only a file that this probe created. Never touch upload records.
      if (handle) {
        try { await handle.close(); } finally { await filesystem.unlink(file); }
      }
    }
  }

  function check() {
    // Coalesce checks so a stalled filesystem cannot accumulate probe files.
    if (!pending) pending = probe().catch(() => { throw unavailable(); }).finally(() => { pending = undefined; });
    return pending;
  }

  async function prepare() {
    try {
      await filesystem.mkdir(config.UPLOAD_DIR, { recursive: true });
      await check();
    } catch {
      throw unavailable();
    }
  }

  return { prepare, check };
}

module.exports = { createStorage };
