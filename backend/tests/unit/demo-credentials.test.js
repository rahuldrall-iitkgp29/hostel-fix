const fs = require('node:fs/promises');
const { credentials } = require('../../seeds/demo');

test('reading existing demo credentials never rewrites local passwords', async () => {
  const saved = Object.fromEntries(
    ['student', 'staff', 'admin', 'enrollment'].map((role) => [
      role,
      `Fixture-only-${role}-password`,
    ])
  );
  vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
  vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(saved));
  const writer = vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
  expect(await credentials({}, { create: false })).toEqual(saved);
  const proposed = await credentials(
    { HOSTELFIX_DEMO_ADMIN_PASSWORD: 'Proposed-only-new-password' },
    { persist: false }
  );
  expect(proposed.admin).toBe('Proposed-only-new-password');
  expect(writer).not.toHaveBeenCalled();
});

test('missing local credentials cannot be claimed by a read-only command', async () => {
  vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
  vi.spyOn(fs, 'readFile').mockRejectedValue(
    Object.assign(new Error('missing'), { code: 'ENOENT' })
  );
  const writer = vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
  await expect(credentials({}, { create: false })).rejects.toThrow(
    'credentials are missing'
  );
  expect(writer).not.toHaveBeenCalled();
});

test('demo overrides must remain valid for normal authentication and enrollment', async () => {
  vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
  vi.spyOn(fs, 'readFile').mockResolvedValue(
    JSON.stringify(
      Object.fromEntries(
        ['student', 'staff', 'admin', 'enrollment'].map((role) => [
          role,
          `Fixture-only-${role}-password`,
        ])
      )
    )
  );
  const writer = vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
  for (const [role, value] of [
    ['ADMIN', 'x'.repeat(129)],
    ['STUDENT', 'short'],
    ['ENROLLMENT', 'x'.repeat(65)],
  ])
    await expect(
      credentials(
        { [`HOSTELFIX_DEMO_${role}_PASSWORD`]: value },
        { persist: false }
      )
    ).rejects.toThrow('validation');
  expect(writer).not.toHaveBeenCalled();
});

test('read-only demo commands reject partial credential files instead of inventing passwords', async () => {
  vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
  vi.spyOn(fs, 'readFile').mockResolvedValue(
    JSON.stringify({ student: 'Fixture-only-student-password' })
  );
  const writer = vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
  await expect(credentials({}, { create: false })).rejects.toThrow(
    'missing the staff password'
  );
  expect(writer).not.toHaveBeenCalled();
});
