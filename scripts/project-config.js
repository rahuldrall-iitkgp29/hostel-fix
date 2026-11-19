const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(root, 'backend/package.json'));
const runtime = path.join(root, '.local/project-runtime');
function localPort(source = process.env) {
  if (source.HOSTELFIX_TEST_PORT) return String(source.HOSTELFIX_TEST_PORT);
  let saved;
  try {
    saved = JSON.parse(
      fs.readFileSync(path.join(runtime, 'settings.json'), 'utf8')
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (saved?.mongoPort) return String(saved.mongoPort);
  // Reuse an existing checkout-owned configuration, never an occupied socket.
  const candidates = [];
  const local = path.join(root, '.local');
  for (const name of fs.existsSync(local) ? fs.readdirSync(local) : []) {
    const directory =
      name === 'mongodb-runtime'
        ? path.join(local, name)
        : /^mongodb-test-\d+$/.test(name)
          ? path.join(local, name, 'mongodb-runtime')
          : null;
    if (!directory) continue;
    try {
      const state = JSON.parse(
        fs.readFileSync(path.join(directory, 'instance.json'), 'utf8')
      );
      const config = JSON.parse(
        fs.readFileSync(path.join(directory, 'mongod.cfg'), 'utf8')
      );
      if (
        path.resolve(state.projectRoot) === root &&
        path.resolve(state.configPath) === path.join(directory, 'mongod.cfg') &&
        config.net.bindIp === '127.0.0.1'
      )
        candidates.push({
          port: config.net.port,
          time: fs.statSync(path.join(directory, 'instance.json')).mtimeMs,
        });
    } catch {
      /* Incomplete or unrelated ownership records are never adopted. */
    }
  }
  return String(candidates.sort((a, b) => b.time - a.time)[0]?.port ?? 27017);
}
function configuration(source = process.env) {
  const port = localPort(source);
  if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535)
    throw new Error('Invalid project MongoDB port.');
  process.env.HOSTELFIX_TEST_PORT = String(Number(port));
  const { loadEnv } = backendRequire('./src/config/env');
  const config = loadEnv({ source });
  const envFile = path.join(root, 'backend/.env');
  const explicitEnvironment =
    source.NODE_ENV ||
    (fs.existsSync(envFile)
      ? backendRequire('dotenv').parse(fs.readFileSync(envFile, 'utf8'))
          .NODE_ENV
      : undefined);
  const production = config.NODE_ENV === 'production';
  if (
    !production &&
    !/^mongodb:\/\/(?:127\.0\.0\.1|localhost):\d+\/hostelfix\?replicaSet=rs0$/.test(
      config.MONGODB_URI
    )
  )
    throw new Error(
      'Local project commands require the configured local hostelfix database; remote configuration is not replaced.'
    );
  const frontendPort = Number(
    source.HOSTELFIX_FRONTEND_PORT || new URL(config.CORS_ORIGIN).port || 3000
  );
  if (
    !Number.isInteger(frontendPort) ||
    frontendPort < 1 ||
    frontendPort > 65535
  )
    throw new Error('Invalid frontend port.');
  const childEnv = { ...source, HOSTELFIX_TEST_PORT: port };
  if (!production) {
    childEnv.MONGODB_URI = `mongodb://127.0.0.1:${port}/hostelfix?replicaSet=rs0`;
    childEnv.TEST_MONGODB_URI = `mongodb://127.0.0.1:${port}/hostelfix_test?replicaSet=rs0`;
    childEnv.NODE_ENV = 'development';
  }
  return {
    root,
    runtime,
    config,
    mongoPort: Number(port),
    frontendPort,
    production,
    explicitEnvironment,
    childEnv,
    apiUrl: `http://localhost:${config.PORT}`,
    frontendUrl: `http://localhost:${frontendPort}`,
  };
}
function npmInvocation(
  script,
  { frontend = false, args = [], source = process.env } = {}
) {
  const cli =
    source.npm_execpath ||
    path.join(
      path.dirname(process.execPath),
      'node_modules/npm/bin/npm-cli.js'
    );
  if (!fs.existsSync(cli))
    throw new Error(
      'Run project commands through npm so npm_execpath is available.'
    );
  return {
    command: process.execPath,
    args: [
      cli,
      'run',
      script,
      ...(frontend
        ? ['--prefix', path.join(root, 'frontend')]
        : ['--workspace', 'backend']),
      ...(args.length ? ['--', ...args] : []),
    ],
  };
}
module.exports = { root, runtime, configuration, localPort, npmInvocation };
