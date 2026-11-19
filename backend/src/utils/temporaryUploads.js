const fs = require('node:fs/promises');
const { setTimeout: delay } = require('node:timers/promises');
async function removeTemporaryUpload(filepath) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.unlink(filepath);
      return;
    } catch (error) {
      if (error.code === 'ENOENT') return;
      // Formidable may still be closing its write stream after an error on Windows.
      if (attempt === 4) throw error;
      await delay(50);
    }
  }
}
module.exports = { removeTemporaryUpload };
