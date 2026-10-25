const { randomUUID } = require('node:crypto');
const request = require('supertest');
const { createApp } = require('../../src/app');
const {
  runTransaction,
  updateWithVersion,
} = require('../../src/utils/transactions');
const {
  hashPassword,
  hashEnrollmentCode,
} = require('../../src/utils/hashUtils');
const { openModelDatabase } = require('./modelDatabase.helper');
const { verifyLocalTestServer } = require('./database.helper');
const {
  userInput,
  hostelInput,
  blockInput,
  roomInput,
  categoryInput,
} = require('./models.helper');

const password = 'Auth fixture password é 2026';
const enrollmentCode = 'AUTH-ENROLLMENT-2026';

async function openAuthDatabase() {
  const fixture = await openModelDatabase();
  const { models, connection } = fixture;
  const emails = new Set();
  const passwordHash = await hashPassword(password);
  const enrollmentCodeHash = await hashEnrollmentCode(enrollmentCode);
  const create = (name, input) => fixture.create(models[name], input);
  const hostel = await create('Hostel', hostelInput({ enrollmentCodeHash }));
  const block = await create('Block', blockInput({ hostelId: hostel._id }));
  const room = await create(
    'Room',
    roomInput({ hostelId: hostel._id, blockId: block._id })
  );
  const category = await create(
    'Category',
    categoryInput({ hostelId: hostel._id })
  );
  const config = { ...fixture.config, COOKIE_SECURE: false };
  const newEmail = () => {
    const email = `auth-${randomUUID()}@example.test`;
    emails.add(email);
    return email;
  };
  const registration = (extra = {}) => ({
    name: 'Auth Student',
    email: newEmail(),
    password,
    enrollmentCode,
    hostelId: String(hostel._id),
    blockId: String(block._id),
    roomId: String(room._id),
    ...extra,
  });
  async function user(extra = {}) {
    const role = extra.role ?? 'STUDENT';
    const input = userInput({
      email: newEmail(),
      passwordHash,
      role,
      hostelId: role === 'ADMIN' ? null : hostel._id,
      blockId: role === 'STUDENT' ? block._id : null,
      roomId: role === 'STUDENT' ? room._id : null,
      categoryIds: role === 'STAFF' ? [category._id] : [],
      adminHostelIds: role === 'ADMIN' ? [hostel._id] : [],
      ...extra,
    });
    emails.add(input.email);
    return create('User', input);
  }
  const app = (extra = {}) =>
    createApp({ config, database: fixture.database, ...extra });
  const mutation = (appInstance, method, path) =>
    request(appInstance)
      [method](path)
      .set('Origin', config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1');
  const post = (appInstance, path) => mutation(appInstance, 'post', path);
  const change = (name, id, mutate, select) =>
    runTransaction(connection, async (session) => {
      const doc = await models[name].findById(id).session(session);
      return updateWithVersion(models[name], {
        filter: { _id: id },
        expectedVersion: doc.version,
        mutate,
        select,
        session,
      });
    });
  async function login(appInstance, account, credentials = {}) {
    const res = await post(appInstance, '/api/v1/auth/login')
      .send({ email: account.email, password, ...credentials })
      .expect(200);
    return {
      res,
      token: res.body.data.accessToken,
      cookie: res.headers['set-cookie'][0].split(';')[0],
    };
  }
  async function close() {
    try {
      await verifyLocalTestServer();
      // Route-created IDs are discovered only through this run's random emails.
      const users = await models.User.find({
        email: { $in: [...emails] },
      }).select('_id');
      for (const account of users)
        fixture.track(models.User, { _id: account._id });
      const records = await models.Session.find({
        userId: { $in: users.map((account) => account._id) },
      }).select('_id');
      for (const record of records)
        fixture.track(models.Session, { _id: record._id });
    } finally {
      await fixture.close();
    }
  }
  return {
    ...fixture,
    config,
    create,
    hostel,
    block,
    room,
    category,
    registration,
    user,
    app,
    mutation,
    post,
    change,
    login,
    close,
    newEmail,
  };
}

module.exports = { openAuthDatabase, password, enrollmentCode };
