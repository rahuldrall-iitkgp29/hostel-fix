const {
  cleanupUploadFiles,
} = require('../../src/services/uploadCleanup.service');
const { createUploadService } = require('../../src/services/upload.service');
const fs = require('node:fs/promises');

test('rejecting invalid uploads always removes their temporary file', async () => {
  vi.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('invalid image'));
  const unlink = vi.spyOn(fs, 'unlink').mockResolvedValue();
  const service = createUploadService({ models: {}, config: {} });
  await expect(
    service.createUpload({
      file: { filepath: 'owned-temp' },
      user: { role: 'STUDENT' },
    })
  ).rejects.toMatchObject({ status: 415 });
  expect(unlink).toHaveBeenCalledWith('owned-temp');
});

test('cleanup preserves referenced, young, unrelated, and symbolic-link files', async () => {
  const names = [
    '12345678-1234-4234-8234-123456789001.png',
    '12345678-1234-4234-8234-123456789002.png',
    '12345678-1234-4234-8234-123456789003.png',
    '12345678-1234-4234-8234-123456789004.png',
    'user-file.png',
  ];
  const now = 10_000_000;
  const filesystem = {
    readdir: vi.fn().mockResolvedValue(names),
    lstat: vi.fn(async (file) => ({
      mtimeMs: file.endsWith('003.png') ? now : 0,
      isFile: () => !file.endsWith('004.png'),
    })),
    unlink: vi.fn().mockResolvedValue(),
  };
  const Attachment = {
    exists: vi.fn(async ({ storageKey }) => storageKey === names[0]),
  };
  expect(
    await cleanupUploadFiles({
      directory: 'uploads',
      Attachment,
      filesystem,
      now,
    })
  ).toBe(1);
  expect(filesystem.unlink).toHaveBeenCalledTimes(1);
  expect(filesystem.unlink.mock.calls[0][0]).toContain(names[1]);
});

test('cleanup does not delete files when database reference checks fail', async () => {
  const filesystem = {
    readdir: async () => ['12345678-1234-4234-8234-123456789001.png'],
    lstat: async () => ({ mtimeMs: 0, isFile: () => true }),
    unlink: vi.fn(),
  };
  await expect(
    cleanupUploadFiles({
      directory: 'uploads',
      filesystem,
      now: 10_000_000,
      Attachment: {
        exists: async () => {
          throw new Error('offline');
        },
      },
    })
  ).rejects.toThrow('offline');
  expect(filesystem.unlink).not.toHaveBeenCalled();
});
