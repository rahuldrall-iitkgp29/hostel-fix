const { runTransaction } = require('../utils/transactions');
const { AppError } = require('../utils/AppError');
const { invalidSession, newRefreshToken } = require('../utils/tokens');
const { hashRefreshToken, verifyRefreshToken } = require('../utils/hashUtils');

const assertActive = (user) => {
  if (!user) throw invalidSession();
  if (user.status !== 'ACTIVE')
    throw new AppError(403, 'ACCOUNT_INACTIVE', 'Account is inactive.');
};
const assertSession = (record) => {
  if (!record || record.isRevoked || record.expiresAt <= new Date())
    throw invalidSession();
};

function createSessionService({ connection, models }) {
  const { User, Session } = models;

  async function loadAccount(
    claims,
    transaction,
    { allowPasswordChange = false } = {}
  ) {
    const record = await Session.findOne({
      _id: claims.sid,
      userId: claims.sub,
    }).session(transaction ?? null);
    assertSession(record);
    const user = await User.findById(claims.sub).session(transaction ?? null);
    assertActive(user);
    if (user.mustChangePassword && !allowPasswordChange) {
      throw new AppError(
        403,
        'PASSWORD_CHANGE_REQUIRED',
        'Change your password before continuing.'
      );
    }
    // Never derive current permissions from possibly stale JWT role/scope claims.
    return { user, record };
  }

  async function revokeForUser(userId, transaction) {
    // Login/refresh/password changes take the same User write guard, preventing
    // a concurrent session from escaping the snapshot used for revocation.
    for await (const record of Session.find({ userId, isRevoked: false })
      .session(transaction)
      .cursor()) {
      record.isRevoked = true;
      await record.save({ session: transaction });
    }
  }

  async function refresh(cookie) {
    if (!cookie) throw invalidSession();
    const replacement = newRefreshToken(cookie.family);
    const tokenHash = await hashRefreshToken(replacement.secret);
    const result = await runTransaction(connection, async (transaction) => {
      const record = await Session.findOne({ tokenFamily: cookie.family })
        .select('+tokenHash')
        .session(transaction);
      assertSession(record);
      const user = await User.findById(record.userId).session(transaction);
      assertActive(user);
      if (!(await verifyRefreshToken(cookie.secret, record.tokenHash))) {
        // Unique tokenFamily means this record represents the complete family.
        record.isRevoked = true;
        await record.save({ session: transaction });
        return { reused: true }; // Throw only AFTER this revocation commits.
      }
      await user.save({ session: transaction });
      record.tokenHash = tokenHash;
      record.lastRefreshedAt = new Date();
      await record.save({ session: transaction });
      return { user, record };
    });
    if (result.reused)
      throw new AppError(
        401,
        'REFRESH_REUSE_DETECTED',
        'Session reuse detected. Please log in again.'
      );
    return { ...result, cookie: replacement.cookie };
  }

  async function logout({ cookie, claims }) {
    await runTransaction(connection, async (transaction) => {
      // Either credential may identify a session. Revoke both if both valid
      // credentials are supplied, without trusting a family locator alone.
      const records = new Map();
      if (cookie) {
        const record = await Session.findOne({ tokenFamily: cookie.family })
          .select('+tokenHash')
          .session(transaction);
        if (
          record &&
          !record.isRevoked &&
          record.expiresAt > new Date() &&
          (await verifyRefreshToken(cookie.secret, record.tokenHash))
        )
          records.set(String(record._id), record);
      }
      if (claims) {
        const record = await Session.findOne({
          _id: claims.sid,
          userId: claims.sub,
        }).session(transaction);
        if (record && !record.isRevoked)
          records.set(String(record._id), record);
      }
      for (const record of records.values()) {
        record.isRevoked = true;
        await record.save({ session: transaction });
      }
    });
  }

  return { loadAccount, revokeForUser, refresh, logout };
}

module.exports = { createSessionService, assertActive, assertSession };
