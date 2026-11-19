const { contact } = require('../../../scripts/supervisor');
const { root, localPort } = require('../../../scripts/project-config');
test('supervisor rejects forged ownership metadata before contacting any process', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch');
  const good = {
    projectRoot: root,
    pid: 123,
    controlPort: 3001,
    token: 'a'.repeat(64),
  };
  for (const state of [
    { ...good, projectRoot: 'unrelated' },
    { ...good, pid: 0 },
    { ...good, controlPort: '3001@remote.invalid' },
    { ...good, token: 'invalid' },
  ])
    await expect(contact('stop', state)).rejects.toThrow('ownership');
  expect(fetcher).not.toHaveBeenCalled();
});
test('explicit project port selection takes precedence without assuming port ownership', () => {
  expect(localPort({ HOSTELFIX_TEST_PORT: '27018' })).toBe('27018');
});
