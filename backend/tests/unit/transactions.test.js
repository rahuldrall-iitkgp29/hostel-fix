const { runTransaction, updateWithVersion, MAX_ATTEMPTS, TRANSACTION_OPTIONS } = require('../../src/utils/transactions');
const { AppError } = require('../../src/utils/AppError');
const { objectId } = require('../helpers/models.helper');

function fixture() {
  let active = false;
  const session = {
    startTransaction: vi.fn(() => { active = true; }),
    commitTransaction: vi.fn(async () => { active = false; }),
    abortTransaction: vi.fn(async () => { active = false; }),
    endSession: vi.fn(async () => {}), inTransaction: () => active,
  };
  const connection = { startSession: vi.fn(async () => session) };
  return { session, connection };
}
const labelledError = (label) => Object.assign(new Error('Synthetic database failure'), { hasErrorLabel: (name) => name === label });

test('transactions use snapshot/majority/primary, return the committed result and close the session', async () => {
  const { session, connection } = fixture();
  const work = vi.fn(async () => 'committed');
  await expect(runTransaction(connection, work)).resolves.toBe('committed');
  expect(work).toHaveBeenCalledWith(session);
  expect(session.startTransaction).toHaveBeenCalledWith(TRANSACTION_OPTIONS);
  expect(session.commitTransaction).toHaveBeenCalledTimes(1);
  expect(session.abortTransaction).not.toHaveBeenCalled();
  expect(session.endSession).toHaveBeenCalledTimes(1);
});

test('transient transaction failures retry the callback and therefore recheck authorization/version', async () => {
  const { session, connection } = fixture();
  const work = vi.fn().mockRejectedValueOnce(labelledError('TransientTransactionError')).mockResolvedValueOnce('committed');
  await expect(runTransaction(connection, work)).resolves.toBe('committed');
  expect(work).toHaveBeenCalledTimes(2);
  expect(session.abortTransaction).toHaveBeenCalledTimes(1);
});

test('persistent transient failures are bounded and become safe unavailability', async () => {
  const { session, connection } = fixture();
  const work = vi.fn().mockRejectedValue(labelledError('TransientTransactionError'));
  await expect(runTransaction(connection, work)).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
  expect(work).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  expect(session.abortTransaction).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  expect(session.endSession).toHaveBeenCalledTimes(1);
});

test('unknown commit results retry only the same commit, never the callback', async () => {
  const { session, connection } = fixture();
  session.commitTransaction.mockRejectedValueOnce(labelledError('UnknownTransactionCommitResult'));
  const work = vi.fn().mockResolvedValue('committed');
  await expect(runTransaction(connection, work)).resolves.toBe('committed');
  expect(session.commitTransaction).toHaveBeenCalledTimes(2);
  expect(work).toHaveBeenCalledTimes(1);
  expect(session.abortTransaction).not.toHaveBeenCalled();
});

test('ambiguous commit retries stop at the bound without replay or a claimed rollback', async () => {
  const { session, connection } = fixture();
  session.commitTransaction.mockRejectedValue(labelledError('UnknownTransactionCommitResult'));
  const work = vi.fn().mockResolvedValue('unknown outcome');
  await expect(runTransaction(connection, work)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  expect(session.commitTransaction).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  expect(work).toHaveBeenCalledTimes(1);
  expect(session.abortTransaction).not.toHaveBeenCalled();
  expect(session.endSession).toHaveBeenCalledTimes(1);
});

test.each([
  new AppError(409, 'VERSION_CONFLICT', 'Conflict.'), new AppError(403, 'FORBIDDEN', 'Forbidden.'),
  Object.assign(new Error('Duplicate key'), { code: 11000 }), new Error('Validation or programming error'),
])('does not retry an arbitrary failure (%s)', async (error) => {
  const { session, connection } = fixture();
  const work = vi.fn().mockRejectedValue(error);
  await expect(runTransaction(connection, work)).rejects.toBe(error);
  expect(work).toHaveBeenCalledTimes(1);
  expect(session.abortTransaction).toHaveBeenCalledTimes(1);
  expect(session.endSession).toHaveBeenCalledTimes(1);
});

test('version helper rejects missing transactions, unsafe IDs and invalid expected versions before querying', async () => {
  const Model = { findOne: vi.fn() };
  await expect(updateWithVersion(Model, { filter: { _id: objectId() }, expectedVersion: 1 })).rejects.toThrow('active transaction');
  const session = { inTransaction: () => true };
  await expect(updateWithVersion(Model, { filter: { _id: { $ne: null } }, expectedVersion: 1, session })).rejects.toThrow('explicit scoped document ID');
  await expect(updateWithVersion(Model, { filter: { _id: objectId() }, expectedVersion: '1', session })).rejects.toMatchObject({ status: 422 });
  expect(Model.findOne).not.toHaveBeenCalled();
});
