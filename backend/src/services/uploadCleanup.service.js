const fs = require('node:fs/promises');
const path = require('node:path');
const { STAGED_LIFETIME_MS } = require('../models/Attachment');
const storageKey =
  /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}\.(?:jpg|jpeg|png|webp)$/i;

async function cleanupUploadFiles({
  directory,
  Attachment,
  filesystem = fs,
  now = Date.now(),
}) {
  let removed = 0;
  for (const name of await filesystem.readdir(directory)) {
    if (!storageKey.test(name)) continue;
    const filepath = path.join(directory, name);
    const info = await filesystem.lstat(filepath);
    // Grace protects new files between filesystem creation and DB commit. Only
    // server-generated regular files with no surviving record are candidates.
    if (!info.isFile() || now - info.mtimeMs < STAGED_LIFETIME_MS + 600_000)
      continue;
    if (await Attachment.exists({ storageKey: name })) continue;
    await filesystem.unlink(filepath);
    removed += 1;
  }
  return removed;
}
function startUploadCleanup({ config, models, logger }) {
  let pending;
  const run = () => {
    if (!pending)
      pending = cleanupUploadFiles({
        directory: config.UPLOAD_DIR,
        Attachment: models.Attachment,
      })
        .catch(() => {
          logger?.warn(
            { event: 'upload_cleanup_failed' },
            'Upload cleanup will retry.'
          );
        })
        .finally(() => {
          pending = undefined;
        });
    return pending;
  };
  const timer = setInterval(run, 600_000);
  timer.unref();
  void run();
  return async () => {
    clearInterval(timer);
    await pending;
  };
}
module.exports = { cleanupUploadFiles, startUploadCleanup };
