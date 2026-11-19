const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { configuration, root } = require('./project-config');
const supervisor = require('./supervisor');
const database = require('./database');

async function main() {
  const settings = configuration();
  if (settings.production)
    throw new Error('Lifecycle verification refuses production.');
  if (await supervisor.contact('status'))
    throw new Error(
      'Stop the existing managed application before running lifecycle verification.'
    );
  const before = await database.inspect(settings);
  const env = {
    ...settings.childEnv,
    PORT: '5016',
    HOSTELFIX_FRONTEND_PORT: '3016',
    CORS_ORIGIN: 'http://localhost:3016',
  };
  const cli =
    process.env.npm_execpath ||
    path.join(
      path.dirname(process.execPath),
      'node_modules/npm/bin/npm-cli.js'
    );
  function launch(command) {
    const child = spawn(process.execPath, [cli, 'run', command], {
      cwd: root,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (data) => {
      output += data;
    });
    child.stderr.on('data', (data) => {
      output += data;
    });
    const done = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve({ code, output }));
    });
    return { child, done, output: () => output };
  }
  async function command(name, expected = 0) {
    const result = await launch(name).done;
    assert.equal(result.code, expected, `${name}: ${result.output}`);
    console.log(`PASS: npm run ${name}`);
    return result;
  }
  async function ready(foreground, services = ['backend', 'frontend']) {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      if (foreground.child.exitCode !== null)
        throw new Error(foreground.output());
      const state = await supervisor.contact('status');
      if (services.every((name) => state?.services[name]?.ready)) return state;
      await delay(500);
    }
    throw new Error(`Lifecycle startup timed out: ${foreground.output()}`);
  }
  let sentinel;
  try {
    await command('db:start');
    await command('db:health');
    const foreground = launch('dev');
    const initial = await ready(foreground);
    await command('health');
    await command('status');
    await command('dev');
    const duplicate = await supervisor.contact('status');
    assert.equal(duplicate.pid, initial.pid);
    assert.equal(duplicate.services.backend.pid, initial.services.backend.pid);
    assert.equal(
      duplicate.services.frontend.pid,
      initial.services.frontend.pid
    );
    await command('backend:stop');
    assert.equal(
      (await supervisor.contact('status')).services.backend,
      undefined
    );
    await command('backend:start');
    await command('frontend:stop');
    assert.equal(
      (await supervisor.contact('status')).services.frontend,
      undefined
    );
    await command('frontend:dev');
    await command('health');
    await command('stop');
    await foreground.done;
    assert.equal(await supervisor.contact('status'), null);
    assert.equal((await database.inspect(settings)).running, false);
    await command('db:start');
    // A listener started by this verifier must neither be adopted nor terminated.
    sentinel = net.createServer((socket) => socket.end('unrelated sentinel'));
    await new Promise((resolve, reject) => {
      sentinel.once('error', reject);
      sentinel.listen(5016, '127.0.0.1', resolve);
    });
    await command('backend:start', 1);
    assert.equal(sentinel.listening, true);
    assert.equal(await supervisor.contact('status'), null);
    assert.equal((await database.inspect(settings)).running, true);
    await new Promise((resolve) => sentinel.close(resolve));
    sentinel = null;
    const configured = launch('start');
    await ready(configured);
    await command('health');
    await command('stop');
    await configured.done;
    const productionFrontend = launch('frontend:start');
    const productionState = await ready(productionFrontend, ['frontend']);
    assert.equal(
      (await fetch(productionState.services.frontend.url)).status,
      200
    );
    await command('frontend:stop');
    await command('stop');
    await productionFrontend.done;
    console.log(
      'PASS: service PID ownership, duplicate starts, separate stops/restarts, failure cleanup, occupied-port preservation, configured start, built production frontend and complete shutdown.'
    );
  } finally {
    if (sentinel) await new Promise((resolve) => sentinel.close(resolve));
    if (await supervisor.contact('status')) await command('stop');
    if (before.running) await database.ensure(settings);
    else if ((await database.inspect(settings)).running)
      await database.manage('stop', settings);
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { main };
