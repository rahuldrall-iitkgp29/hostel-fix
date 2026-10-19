const { runTransaction, updateWithVersion } = require('../utils/transactions');
const { userSelf } = require('../models/projections');

function createUserService({ connection, models, sessions }) {
  const self = (user) => ({ user: userSelf(user) });
  async function update(claims, input) {
    const user = await runTransaction(connection, async (transaction) => {
      const { record } = await sessions.loadAccount(claims, transaction);
      const updated = await updateWithVersion(models.User, {
        filter: { _id: claims.sub }, expectedVersion: input.expectedVersion, session: transaction,
        mutate: (doc) => {
          if (input.name !== undefined) doc.name = input.name;
          if (input.phone !== undefined) doc.phone = input.phone;
        },
      });
      // Serialize an authorized write with logout/revocation as well as account changes.
      await record.save({ session: transaction });
      return updated;
    });
    return self(user);
  }
  return { self, update };
}

module.exports = { createUserService };
