const { runTransaction } = require('../utils/transactions');
const { AppError } = require('../utils/AppError');
const {
  hashPassword,
  verifyPassword,
  verifyEnrollmentCode,
  hashRefreshToken,
  dummyHash,
} = require('../utils/hashUtils');
const { newRefreshToken, invalidSession } = require('../utils/tokens');
const { assertActive } = require('./session.service');

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
const invalidEnrollment = () =>
  new AppError(422, 'ENROLLMENT_INVALID', 'Enrollment details are invalid.');

function createAuthService({ connection, models, config, sessions }) {
  const { User, Hostel, Block, Room, Session } = models;

  async function register(input) {
    const passwordHash = await hashPassword(input.password);
    try {
      return await runTransaction(connection, async (transaction) => {
        const hostel = await Hostel.findById(input.hostelId)
          .select('+enrollmentCodeHash')
          .session(transaction);
        const validCode = await verifyEnrollmentCode(
          input.enrollmentCode,
          hostel?.enrollmentCodeHash ?? (await dummyHash('enrollment'))
        );
        const block = await Block.findOne({
          _id: input.blockId,
          hostelId: input.hostelId,
        }).session(transaction);
        const room = await Room.findOne({
          _id: input.roomId,
          hostelId: input.hostelId,
          blockId: input.blockId,
        }).session(transaction);
        if (
          !validCode ||
          !hostel?.isActive ||
          !block?.isActive ||
          !room?.isActive
        )
          throw invalidEnrollment();
        // Same reference write guards as deactivation; the parent Hostel is first.
        for (const reference of [hostel, block, room])
          await reference.save({ session: transaction });
        const user = new User({
          name: input.name,
          email: input.email,
          phone: input.phone ?? null,
          passwordHash,
          role: 'STUDENT',
          status: 'ACTIVE',
          mustChangePassword: false,
          hostelId: hostel._id,
          blockId: block._id,
          roomId: room._id,
        });
        await user.save({ session: transaction });
        return user;
      });
    } catch (error) {
      if (error.code === 11000 && error.keyPattern?.email) {
        throw new AppError(409, 'EMAIL_IN_USE', 'Email is already registered.');
      }
      throw error;
    }
  }

  async function login(input, audit) {
    const candidate = await User.findOne({ email: input.email }).select(
      '+passwordHash'
    );
    const verified = await verifyPassword(
      input.password,
      candidate?.passwordHash ?? (await dummyHash('password'))
    );
    if (!candidate || !verified) throw invalidCredentials();
    assertActive(candidate);
    const refresh = newRefreshToken();
    const tokenHash = await hashRefreshToken(refresh.secret);
    const result = await runTransaction(connection, async (transaction) => {
      const user = await User.findById(candidate._id)
        .select('+passwordHash')
        .session(transaction);
      if (!user || user.passwordHash !== candidate.passwordHash)
        throw invalidCredentials();
      assertActive(user);
      await user.save({ session: transaction });
      const record = new Session({
        userId: user._id,
        tokenFamily: refresh.family,
        tokenHash,
        expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_EXPIRY * 1000),
        userAgent: audit.userAgent ?? null,
        ipAddress: audit.ipAddress ?? null,
      });
      await record.save({ session: transaction });
      return { user, record };
    });
    return { ...result, cookie: refresh.cookie };
  }

  async function changePassword(claims, input) {
    const candidate = await User.findById(claims.sub).select('+passwordHash');
    if (!candidate) throw invalidSession();
    if (!(await verifyPassword(input.currentPassword, candidate.passwordHash)))
      throw invalidCredentials();
    if (input.currentPassword === input.newPassword) {
      throw new AppError(
        422,
        'PASSWORD_UNCHANGED',
        'Choose a different password.'
      );
    }
    const passwordHash = await hashPassword(input.newPassword);
    await runTransaction(connection, async (transaction) => {
      await sessions.loadAccount(claims, transaction, {
        allowPasswordChange: true,
      });
      const user = await User.findById(claims.sub)
        .select('+passwordHash')
        .session(transaction);
      if (user.passwordHash !== candidate.passwordHash)
        throw invalidCredentials();
      user.passwordHash = passwordHash;
      user.mustChangePassword = false;
      await user.save({ session: transaction });
      await sessions.revokeForUser(user._id, transaction);
    });
  }

  return { register, login, changePassword };
}

module.exports = { createAuthService };
