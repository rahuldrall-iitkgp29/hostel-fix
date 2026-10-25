const fs = require('node:fs/promises');
const path = require('node:path');
const { createStorage } = require('../../src/config/storage');
const { POLICY, refreshCookieOptions } = require('../../src/config/policy');
const { parseEnv } = require('../../src/config/env');
const { testEnv } = require('../helpers/env.helper');

test('private storage creates its directory, probes read/write and removes only its temporary file', async () => {
  const root = path.resolve(__dirname, '../../.local');
  await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, 'storage-test-'));
  const uploadDir = path.join(directory, 'uploads');
  const storage = createStorage({ UPLOAD_DIR: uploadDir });
  try {
    await storage.prepare();
    await fs.writeFile(
      path.join(uploadDir, 'preserve.txt'),
      'existing upload',
      { flag: 'wx' }
    );
    await Promise.all([storage.check(), storage.check()]);
    expect(await fs.readdir(uploadDir)).toEqual(['preserve.txt']);
    expect(
      await fs.readFile(path.join(uploadDir, 'preserve.txt'), 'utf8')
    ).toBe('existing upload');
  } finally {
    await fs.unlink(path.join(uploadDir, 'preserve.txt'));
    await fs.rmdir(uploadDir);
    await fs.rmdir(directory);
  }
  await expect(storage.check()).rejects.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
  });
});

test('permission failures are safe and an unowned path is never unlinked', async () => {
  const filesystem = {
    open: vi.fn().mockRejectedValue(new Error('EACCES private path')),
    unlink: vi.fn(),
  };
  await expect(
    createStorage({ UPLOAD_DIR: '/private' }, { filesystem }).check()
  ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  expect(filesystem.unlink).not.toHaveBeenCalled();
});

test('a failed write still closes and removes its own probe', async () => {
  const handle = {
    writeFile: vi.fn().mockRejectedValue(new Error('ENOSPC')),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const filesystem = {
    open: vi.fn().mockResolvedValue(handle),
    unlink: vi.fn().mockResolvedValue(undefined),
  };
  await expect(
    createStorage({ UPLOAD_DIR: '/private' }, { filesystem }).check()
  ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  expect(handle.close).toHaveBeenCalledOnce();
  expect(filesystem.unlink).toHaveBeenCalledOnce();
});

test('refresh cookie and upload/rate settings follow the fixed P0 contract', () => {
  const config = parseEnv(testEnv());
  expect(refreshCookieOptions(config)).toEqual({
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: 604800000,
  });
  expect(
    refreshCookieOptions({ ...config, COOKIE_DOMAIN: '.example.com' }).domain
  ).toBe('.example.com');
  expect(POLICY.upload).toEqual({
    bytes: 5242880,
    pixels: 12000000,
    dimension: 6000,
    files: 1,
  });
  expect(POLICY.rates.read).toEqual({ windowMs: 60000, limit: 120 });
  expect(POLICY.rates.write.limit).toBe(30);
  expect(POLICY.rates.upload.limit).toBe(10);
  expect(Object.isFrozen(POLICY.rates.write)).toBe(true);
});
