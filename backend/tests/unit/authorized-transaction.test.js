const { guardMutation } = require('../../src/utils/authorizedTransaction');

test('revoked sessions cannot reach the mutation write guards', async () => {
  const sessions = {
    loadAccount: vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('revoked'), { status: 401 })),
  };
  await expect(
    guardMutation(sessions, { $locals: { authClaims: { sid: 'session' } } }, {})
  ).rejects.toMatchObject({ status: 401 });
});
test('permission changes abort a transaction before any write', async () => {
  const save = vi.fn();
  const current = { role: 'ADMIN', adminHostelIds: ['other'], save };
  const sessions = {
    loadAccount: async () => ({ user: current, record: { save } }),
  };
  await expect(
    guardMutation(
      sessions,
      {
        role: 'ADMIN',
        adminHostelIds: ['original'],
        $locals: { authClaims: {} },
      },
      {}
    )
  ).rejects.toMatchObject({ status: 403 });
  expect(save).not.toHaveBeenCalled();
});
test('authorized writes share account and session guards with revocation', async () => {
  const save = vi.fn().mockResolvedValue();
  const user = {
    role: 'STUDENT',
    hostelId: 'hostel',
    $locals: { authClaims: {} },
    save,
  };
  const sessions = { loadAccount: async () => ({ user, record: { save } }) };
  const transaction = {};
  await guardMutation(sessions, user, transaction);
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenCalledWith({ session: transaction });
});
