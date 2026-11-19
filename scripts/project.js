const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { configuration, npmInvocation } = require('./project-config');
async function runPackage(script, frontend, args = []) {
  const settings = configuration();
  const invocation = npmInvocation(script, { frontend, args });
  const env = { ...settings.childEnv };
  if (frontend && ['build', 'typecheck'].includes(script))
    env.NODE_ENV = 'production';
  await new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `${frontend ? 'Frontend' : 'Backend'} ${script} failed (${code}).`
            )
          )
    );
  });
}
async function main(action = process.argv[2], args = process.argv.slice(3)) {
  const supervisor = require('./supervisor');
  const database = require('./database');
  const settings = configuration();
  if (
    [
      'dev',
      'start',
      'backend:start',
      'backend:dev',
      'frontend:dev',
      'frontend:start',
    ].includes(action)
  ) {
    if (action === 'dev' && settings.production)
      throw new Error('dev refuses production configuration.');
    await supervisor.run({
      services: action.startsWith('backend:')
        ? ['backend']
        : action.startsWith('frontend:')
          ? ['frontend']
          : ['backend', 'frontend'],
      dev: action === 'dev' || action === 'backend:dev',
      frontendProduction: action === 'frontend:start',
    });
  } else if (
    action === 'stop' ||
    action === 'backend:stop' ||
    action === 'frontend:stop'
  ) {
    const existing = await supervisor.contact(
      action === 'stop' ? 'stop' : `stop-${action.split(':')[0]}`
    );
    if (!existing) {
      if (action === 'stop' && !settings.production) {
        const status = await database.inspect(settings);
        if (status.running) await database.manage('stop', settings);
      }
      console.log('No managed application process is running.');
      return;
    }
    if (action === 'stop') {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (!(await supervisor.readState())) {
          console.log('Project services stopped; database data retained.');
          return;
        }
        await delay(500);
      }
      throw new Error('Managed shutdown did not complete in time.');
    }
    console.log(`${action.split(':')[0]} stopped.`);
  } else if (action === 'status' || action === 'health') {
    const managed = await supervisor.contact('status');
    const dbStatus = await database.inspect(settings);
    const status = { database: dbStatus, supervisor: managed ?? 'stopped' };
    if (action === 'health') {
      if (!dbStatus.running) throw new Error('Database is stopped.');
      for (const name of ['backend', 'frontend']) {
        const service = managed?.services[name];
        if (!service?.running)
          throw new Error(`${name} is not managed/running.`);
        const response = await fetch(
          name === 'backend'
            ? `${service.url}/api/v1/health/ready`
            : service.url,
          { signal: AbortSignal.timeout(10_000) }
        );
        if (!response.ok)
          throw new Error(`${name} health failed (${response.status}).`);
      }
      status.healthy = true;
    }
    console.log(JSON.stringify(status, null, 2));
  } else if (action === 'build') {
    await runPackage('build', false);
    await runPackage('build', true);
  } else if (
    action === 'test' ||
    action === 'backend:test' ||
    action === 'backend:coverage' ||
    action === 'test:coverage'
  ) {
    if (settings.production)
      throw new Error(
        'Local test orchestration refuses production configuration.'
      );
    const started = await database.ensure(settings);
    try {
      await runPackage(
        action.endsWith('coverage') ? 'test:coverage' : 'test',
        false,
        args
      );
      if (action === 'test' || action === 'test:coverage') {
        await runPackage('test', true);
        await runPackage('test:browser', true);
      }
    } finally {
      if (started) await database.manage('stop', settings);
    }
  } else if (action.startsWith('backend:'))
    await runPackage(action.slice(8), false, args);
  else if (action.startsWith('frontend:'))
    await runPackage(action.slice(9), true, args);
  else throw new Error('Unknown project command.');
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { main, runPackage };
