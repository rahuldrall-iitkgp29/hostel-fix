const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
function check(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filepath = path.join(directory, entry.name);
    if (entry.isDirectory()) check(filepath);
    else if (entry.name.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', filepath], {
        encoding: 'utf8',
        windowsHide: true,
      });
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(result.stderr || 'JavaScript syntax check failed.');
    }
  }
}
check(path.resolve(__dirname, '../src'));
check(path.resolve(__dirname, '../seeds'));
console.log('Backend JavaScript syntax checks passed. No bundle is required.');
