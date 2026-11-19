const fs = require('node:fs/promises');
const nativeFs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const { configuration, runtime, root } = require('./project-config');
const database = require('./database');
const stateFile = path.join(runtime, 'instance.json');
const lockFile = path.join(runtime, 'manager.lock');
async function readState() {
  try {
    return JSON.parse(await fs.readFile(stateFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
async function contact(action, state = undefined) {
  state ??= await readState();
  if (!state) return null;
  if (
    state.projectRoot !== root ||
    !/^[a-f\d]{64}$/.test(state.token) ||
    !Number.isInteger(state.pid) ||
    state.pid <= 0 ||
    !Number.isInteger(state.controlPort) ||
    state.controlPort < 1 ||
    state.controlPort > 65535
  )
    throw new Error('Supervisor ownership cannot be established.');
  try {
    const res = await fetch(`http://127.0.0.1:${state.controlPort}/${action}`, {
      method: 'POST',
      headers: { 'X-HostelFix-Control': state.token },
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.json();
    if (!res.ok || body.projectRoot !== root || body.pid !== state.pid)
      throw new Error(body.error || 'Supervisor ownership response mismatch.');
    return body;
  } catch (error) {
    try {
      process.kill(state.pid, 0);
    } catch (missing) {
      if (missing.code === 'ESRCH') return null;
    }
    throw new Error(
      `Project supervisor is not reachable; refusing to kill or claim PID ${state.pid}. ${error.message}`
    );
  }
}
async function run({
  services = ['backend', 'frontend'],
  dev = false,
  frontendProduction = false,
} = {}) {
  const settings = configuration();
  process.env.HOSTELFIX_TEST_PORT = String(settings.mongoPort);
  const existing = await contact('status');
  if (existing) {
    for (const service of services)
      await contact(
        service === 'frontend' && frontendProduction
          ? 'start-frontend-production'
          : `start-${service}`
      );
    console.log('Existing project supervisor retained.');
    console.log(JSON.stringify(await contact('status'), null, 2));
    return;
  }
  await fs.mkdir(runtime, { recursive: true });
  let lock;
  try {
    lock = await fs.open(lockFile, 'wx', 0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const owner = JSON.parse(await fs.readFile(lockFile, 'utf8'));
    if (
      owner.projectRoot !== root ||
      !Number.isInteger(owner.pid) ||
      owner.pid <= 0
    )
      throw new Error('Unknown supervisor lock owner.');
    try {
      process.kill(owner.pid, 0);
      throw new Error('Another project manager is starting or running.');
    } catch (missing) {
      if (missing.code !== 'ESRCH') throw missing;
    }
    await fs.unlink(lockFile);
    lock = await fs.open(lockFile, 'wx', 0o600);
  }
  await lock.writeFile(JSON.stringify({ pid: process.pid, projectRoot: root }));
  await lock.close();
  await fs.writeFile(
    path.join(runtime, 'settings.json'),
    JSON.stringify({ mongoPort: settings.mongoPort }, null, 2)
  );
  const token = randomBytes(32).toString('hex');
  const children = new Map();
  const intentionallyStopped = new Set();
  const readyServices = new Set();
  let dbStarted = false;
  let stopping = false;
  let monitor;
  let watcher;
  let restartTimer;
  let control;
  let controlPort;
  let resolveStopped;
  const stopped = new Promise((resolve) => {
    resolveStopped = resolve;
  });
  const status = () => ({
    projectRoot: root,
    pid: process.pid,
    mode: settings.production
      ? 'production'
      : dev
        ? 'development with backend watch'
        : 'configured start',
    database: { port: settings.mongoPort, startedBySupervisor: dbStarted },
    services: Object.fromEntries(
      [...children].map(([name, child]) => [
        name,
        {
          pid: child.pid,
          url: name === 'backend' ? settings.apiUrl : settings.frontendUrl,
          running: child.exitCode === null,
          ready: readyServices.has(name),
        },
      ])
    ),
  });
  async function persist() {
    await fs.writeFile(
      stateFile,
      JSON.stringify({ ...status(), token, controlPort }, null, 2),
      { mode: 0o600 }
    );
  }
  async function stopService(name) {
    const child = children.get(name);
    if (!child) return;
    intentionallyStopped.add(child.pid);
    readyServices.delete(name);
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        console.error(
          `${name} did not drain; terminating only its spawned process handle.`
        );
        child.kill();
      }, 8000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      if (child.exitCode !== null) {
        clearTimeout(timer);
        resolve();
      } else
        child.send('stop', (error) => {
          if (error) child.kill();
        });
    });
    children.delete(name);
    if (!stopping) await persist();
  }
  async function startService(name, productionFrontend = frontendProduction) {
    if (!['backend', 'frontend'].includes(name))
      throw new Error('Unknown service.');
    if (children.has(name)) return;
    if (!settings.production)
      dbStarted = (await database.ensure(settings)) || dbStarted;
    const env = {
      ...settings.childEnv,
      NODE_ENV: settings.config.NODE_ENV,
      HOSTELFIX_FRONTEND_PORT: String(settings.frontendPort),
      HOSTELFIX_FRONTEND_MODE:
        settings.production || productionFrontend ? 'start' : 'dev',
    };
    if (!settings.production && !productionFrontend)
      env.NEXT_PUBLIC_API_BASE_URL = `${settings.apiUrl}/api/v1`;
    const child = spawn(
      process.execPath,
      [path.join(root, 'scripts/managed-service.js'), name],
      { env, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] }
    );
    children.set(name, child);
    child.on('exit', (code) => {
      if (stopping || intentionallyStopped.delete(child.pid)) return;
      children.delete(name);
      readyServices.delete(name);
      if (code === 77 && name === 'frontend' && !settings.production) {
        void startService(name).catch(fail);
        return;
      }
      fail(
        new Error(
          `${name} exited unexpectedly (${code}); dependent services will stop.`
        )
      );
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${name} startup timed out.`)),
        90_000
      );
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`${name} failed to start (${code}).`));
      });
      child.on('message', (message) => {
        if (
          message?.type === 'ready' &&
          message.service === name &&
          message.pid === child.pid
        ) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    const probe = await fetch(
      name === 'backend'
        ? `${settings.apiUrl}/api/v1/health/ready`
        : settings.frontendUrl,
      { signal: AbortSignal.timeout(45_000) }
    );
    if (!probe.ok)
      throw new Error(
        `${name} started but its HTTP readiness check failed (${probe.status}).`
      );
    readyServices.add(name);
    await persist();
    console.log(
      `${name}: ${name === 'backend' ? settings.apiUrl + '/api/v1' : settings.frontendUrl} (owned PID ${child.pid})`
    );
  }
  async function shutdown(stopDatabase = dbStarted) {
    if (stopping) return stopped;
    stopping = true;
    clearInterval(monitor);
    clearTimeout(restartTimer);
    watcher?.close();
    try {
      await stopService('frontend');
      await stopService('backend');
      if (stopDatabase && !settings.production)
        await database.manage('stop', settings);
    } finally {
      if (control) await new Promise((resolve) => control.close(resolve));
      const owned = await readState();
      if (!owned || owned.token === token)
        await fs.unlink(stateFile).catch(() => {});
      await fs.unlink(lockFile).catch(() => {});
      resolveStopped();
    }
  }
  function fail(error) {
    console.error(error.message);
    process.exitCode = 1;
    if (stopping) return;
    void shutdown().catch((failure) => {
      console.error(failure.message);
      resolveStopped();
    });
  }
  let operations = Promise.resolve();
  try {
    control = http.createServer((req, res) => {
      if (
        req.method !== 'POST' ||
        req.headers.origin ||
        req.headers['x-hostelfix-control'] !== token
      ) {
        res.writeHead(403).end();
        return;
      }
      operations = operations.then(async () => {
        const action = req.url.slice(1);
        try {
          if (action === 'stop') {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ...status(), stopped: true }));
            void shutdown(true).catch(fail);
            return;
          }
          if (action === 'start-frontend-production')
            await startService('frontend', true);
          else if (action.startsWith('start-'))
            await startService(action.slice(6));
          else if (action.startsWith('stop-'))
            await stopService(action.slice(5));
          else if (action !== 'status')
            throw new Error('Unknown supervisor command.');
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(status()));
        } catch (error) {
          res
            .writeHead(500, { 'Content-Type': 'application/json' })
            .end(JSON.stringify({ ...status(), error: error.message }));
        }
      });
    });
    await new Promise((resolve, reject) => {
      control.once('error', reject);
      control.listen(0, '127.0.0.1', resolve);
    });
    controlPort = control.address().port;
    await persist();
    for (const service of services) await startService(service);
    if (dev && children.has('backend'))
      watcher = nativeFs.watch(
        path.join(root, 'backend/src'),
        { recursive: true },
        () => {
          if (!children.has('backend')) return;
          clearTimeout(restartTimer);
          restartTimer = setTimeout(() => {
            operations = operations
              .then(async () => {
                if (!children.has('backend')) return;
                await stopService('backend');
                await startService('backend');
              })
              .catch(fail);
          }, 250);
        }
      );
    monitor = setInterval(() => {
      if (children.has('backend'))
        void fetch(`${settings.apiUrl}/api/v1/health/ready`, {
          signal: AbortSignal.timeout(5000),
        })
          .then((res) => {
            if (!res.ok)
              throw new Error('Backend dependency readiness failed.');
          })
          .catch(fail);
    }, 10_000);
    process.once('SIGINT', () => {
      void shutdown().catch(fail);
    });
    process.once('SIGTERM', () => {
      void shutdown().catch(fail);
    });
    console.log(
      'Project services ready. Ctrl+C stops children started here. npm run status/health/stop work from another terminal.'
    );
    await stopped;
  } catch (error) {
    await shutdown().catch(() => {});
    throw error;
  }
}
module.exports = { run, contact, readState };
