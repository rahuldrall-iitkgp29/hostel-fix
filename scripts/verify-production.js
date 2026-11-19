const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const request = require('supertest');
const {
  verifyLocalTestServer,
} = require('../backend/tests/helpers/database.helper');
const { testEnv } = require('../backend/tests/helpers/env.helper');
const { parseEnv } = require('../backend/src/config/env');

async function main() {
  const uri = await verifyLocalTestServer();
  const root = path.resolve(__dirname, '..');
  // Outside the repository: Node must not fall back to ancestor dev packages.
  const directory = path.join(
    tmpdir(),
    `hostelfix-production-install-${randomUUID()}`
  );
  await fs.mkdir(path.join(directory, 'backend'), { recursive: true });
  for (const name of ['package.json', 'package-lock.json'])
    await fs.copyFile(path.join(root, name), path.join(directory, name));
  await fs.copyFile(
    path.join(root, 'backend/package.json'),
    path.join(directory, 'backend/package.json')
  );
  for (const name of ['src', 'scripts', 'seeds'])
    await fs.cp(
      path.join(root, 'backend', name),
      path.join(directory, 'backend', name),
      { recursive: true }
    );
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
  const args =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npm.cmd ci --omit=dev --no-audit']
      : ['ci', '--omit=dev', '--no-audit'];
  const install = spawnSync(command, args, {
    cwd: directory,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 240_000,
  });
  if (install.status !== 0)
    throw new Error(
      install.stderr || 'Production-only dependency installation failed.'
    );
  const { createRequire } = require('node:module');
  const requireInstalled = createRequire(
    path.join(directory, 'backend/package.json')
  );
  const formidablePath = requireInstalled.resolve('formidable');
  if (!formidablePath.startsWith(directory))
    throw new Error('Dependency escaped the isolated installation.');
  try {
    requireInstalled.resolve('vitest');
    throw new Error('Development dependencies were installed.');
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
  }
  const { startServer } = requireInstalled('./src/server');
  const server = await startServer({
    config: {
      ...parseEnv(
        testEnv({
          TEST_MONGODB_URI: uri,
          UPLOAD_DIR: path.join(directory, 'uploads'),
          LOG_LEVEL: 'silent',
        })
      ),
      PORT: 0,
    },
    host: '127.0.0.1',
  });
  try {
    await request(server).get('/api/v1/health').expect(200);
    await request(server).get('/api/v1/health/ready').expect(200);
    console.log(
      'PASS: isolated npm ci --omit=dev, local formidable resolution, backend startup and both health probes.'
    );
    console.log(
      'Startup used test-mode configuration against verified owned MongoDB; no production credentials were used.'
    );
    console.log(`Retained isolated verification directory: ${directory}`);
  } finally {
    await server.shutdown();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
