const { AppError, unavailable } = require('./AppError');
const { activeTransaction, isId } = require('../models/common');

const MAX_ATTEMPTS = 3;
const TRANSACTION_OPTIONS = Object.freeze({
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
  readPreference: 'primary',
  maxCommitTimeMS: 5000,
});
const labelled = (error, label) => error?.hasErrorLabel?.(label) === true;
const versionConflict = () =>
  new AppError(
    409,
    'VERSION_CONFLICT',
    'This record changed. Refresh it before retrying.'
  );

// work must reload and reauthorize on every attempt; never send HTTP responses,
// write files, or run parallel operations on this session inside the callback.
async function runTransaction(connection, work) {
  const session = await connection.startSession();
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      session.startTransaction(TRANSACTION_OPTIONS);
      let commitUnknown = false;
      try {
        const result = await work(session);
        for (
          let commitAttempt = 1;
          commitAttempt <= MAX_ATTEMPTS;
          commitAttempt += 1
        ) {
          try {
            await session.commitTransaction();
            return result;
          } catch (error) {
            if (!labelled(error, 'UnknownTransactionCommitResult')) throw error;
            // Retry only the SAME commit, never the mutation, when its outcome
            // is unknown. At the bound the client must refetch before retrying.
            commitUnknown = true;
            if (commitAttempt === MAX_ATTEMPTS) throw unavailable();
          }
        }
      } catch (error) {
        if (!commitUnknown && session.inTransaction())
          await session.abortTransaction().catch(() => {});
        if (!commitUnknown && labelled(error, 'TransientTransactionError')) {
          if (attempt < MAX_ATTEMPTS) continue;
          throw unavailable();
        }
        throw error;
      }
    }
  } finally {
    await session.endSession();
  }
}

// filter is constructed by a service, including the authenticated scope and a
// single _id. An inaccessible record is hidden before its version is inspected.
// A no-op mutate callback is a reference/staff/parent-hostel write guard (§7.4).
async function updateWithVersion(
  Model,
  { filter, expectedVersion, session, mutate = () => {}, select }
) {
  if (!activeTransaction(session))
    throw new Error('Versioned writes require an active transaction.');
  if (!filter || !isId(filter._id))
    throw new Error(
      'Versioned writes require one explicit scoped document ID.'
    );
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'A positive integer expectedVersion is required.'
    );
  }
  let query = Model.findOne(filter).session(session);
  if (select) query = query.select(select);
  const doc = await query;
  if (!doc) throw new AppError(404, 'NOT_FOUND', 'Resource not found.');
  if (doc.version !== expectedVersion) throw versionConflict();
  await mutate(doc, session);
  try {
    return await doc.save({ session });
  } catch (error) {
    if (error.name === 'DocumentNotFoundError' || error.name === 'VersionError')
      throw versionConflict();
    throw error;
  }
}

module.exports = {
  runTransaction,
  updateWithVersion,
  MAX_ATTEMPTS,
  TRANSACTION_OPTIONS,
};
