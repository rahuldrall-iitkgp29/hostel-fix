import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
export default async function setup() {
  const child = spawn(
    process.execPath,
    [path.resolve('../scripts/browser-fixture.js')],
    {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    }
  );
  let errors = '';
  child.stderr?.on('data', (chunk) => {
    errors += String(chunk);
  });
  const data = await new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Browser test fixture startup timed out.')),
      45_000
    );
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', () => {
      clearTimeout(timer);
      reject(new Error(errors || 'Browser fixture exited before readiness.'));
    });
    child.on('message', (message) => {
      if (
        message &&
        typeof message === 'object' &&
        'type' in message &&
        message.type === 'ready' &&
        'data' in message
      ) {
        clearTimeout(timer);
        resolve(message.data);
      }
    });
  });
  await mkdir('.local', { recursive: true });
  await writeFile('.local/browser-state.json', JSON.stringify(data), {
    mode: 0o600,
  });
  return async () => {
    const exited = new Promise<void>((resolve, reject) =>
      child.once('exit', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(errors || 'Browser fixture cleanup failed.'))
      )
    );
    child.send('stop');
    await exited;
  };
}
