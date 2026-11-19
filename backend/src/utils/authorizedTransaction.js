const { runTransaction } = require('./transactions');
const { AppError } = require('./AppError');

async function guardMutation(sessions, user, transaction) {
  if (!sessions) return; // Explicit service unit fixtures can omit HTTP sessions.
  const claims = user.$locals?.authClaims;
  if (!claims)
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
  const current = await sessions.loadAccount(claims, transaction);
  const scope = (account) =>
    JSON.stringify({
      role: account.role,
      hostelId: String(account.hostelId),
      blockId: String(account.blockId),
      roomId: String(account.roomId),
      categories: (account.categoryIds ?? []).map(String).sort(),
      hostels: (account.adminHostelIds ?? []).map(String).sort(),
    });
  if (scope(current.user) !== scope(user))
    throw new AppError(
      403,
      'FORBIDDEN',
      'Account permissions changed. Refresh your session.'
    );
  // Share write guards with logout/password changes/account deactivation so
  // revocation cannot race an authorized mutation or a transaction retry.
  await current.user.save({ session: transaction });
  await current.record.save({ session: transaction });
}
function authorizedTransaction(connection, sessions, user, work) {
  return runTransaction(connection, async (transaction) => {
    await guardMutation(sessions, user, transaction);
    return work(transaction);
  });
}
module.exports = { authorizedTransaction, guardMutation };
