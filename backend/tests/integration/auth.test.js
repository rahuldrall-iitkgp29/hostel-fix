const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { openAuthDatabase, password, enrollmentCode } = require('../helpers/auth.helper');
const { objectId, hostelInput, blockInput, roomInput } = require('../helpers/models.helper');
const { verifyPassword, verifyRefreshToken } = require('../../src/utils/hashUtils');
const { createLogger } = require('../../src/config/logger');

let fixture;
beforeAll(async () => { fixture = await openAuthDatabase(); }, 30000);
afterAll(async () => { await fixture?.close(); }, 30000);
const me = (app, token, path = '/api/v1/auth/me') => request(app).get(path).set('Authorization', `Bearer ${token}`);
const refresh = (app, cookie) => fixture.post(app, '/api/v1/auth/refresh').set('Cookie', cookie).send({});
const logout = (app, cookie) => fixture.post(app, '/api/v1/auth/logout').set('Cookie', cookie).send({});
const patch = (app, token, input) => fixture.mutation(app, 'patch', '/api/v1/users/me')
  .set('Authorization', `Bearer ${token}`).send(input);
const changePassword = (app, token, input = {}) => fixture.post(app, '/api/v1/users/me/password')
  .set('Authorization', `Bearer ${token}`).send({ currentPassword: password, newPassword: 'New Auth password é 2026', ...input });
const code = (res, expected) => {
  expect(res.body.error.code).toBe(expected);
  expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  expect(res.body.error).not.toHaveProperty('stack');
};
const sid = (login) => jwt.decode(login.token).sid;
const cleared = (res) => {
  const cookie = res.headers['set-cookie'][0];
  expect(cookie).toContain('hf_refresh=;');
  expect(cookie).toContain('Path=/api/v1/auth');
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Strict');
  expect(cookie).toContain('Expires=Thu, 01 Jan 1970');
  expect(cookie).not.toContain('Max-Age=604800');
};

test('registration creates only a normalized student, hashes the full password and guards all references', async () => {
  const app = fixture.app();
  const input = fixture.registration({ password: 'é'.repeat(48) + ' private suffix ' });
  const before = await Promise.all([fixture.models.Hostel.findById(input.hostelId),
    fixture.models.Block.findById(input.blockId), fixture.models.Room.findById(input.roomId)]);
  const res = await fixture.post(app, '/api/v1/auth/register').send({ ...input, email: ` ${input.email.toUpperCase()} ` }).expect(201);
  expect(res.body.data.user).toMatchObject({ email: input.email, role: 'STUDENT', status: 'ACTIVE', version: 1, phone: null, mustChangePassword: false });
  expect(Object.keys(res.body.data)).toEqual(['user']);
  expect(res.headers['set-cookie']).toBeUndefined();
  const user = await fixture.models.User.findById(res.body.data.user.id).select('+passwordHash +enrollmentCodeHash');
  expect(user.passwordHash).toMatch(/^\$2b\$12\$/);
  expect(await verifyPassword(input.password, user.passwordHash)).toBe(true);
  expect(user.enrollmentCodeHash).toBeNull();
  expect(await fixture.models.Session.countDocuments({ userId: user._id })).toBe(0);
  for (const [i, Model] of [fixture.models.Hostel, fixture.models.Block, fixture.models.Room].entries()) {
    expect((await Model.findById(before[i]._id)).version).toBe(before[i].version + 1);
  }
  await fixture.login(app, user, { password: input.password });
  const wrong = await fixture.post(app, '/api/v1/auth/login').send({ email: input.email, password: 'é'.repeat(48) + ' different suffix ' }).expect(401);
  code(wrong, 'INVALID_CREDENTIALS');
  expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|enrollmentCode|accessToken|tokenHash/);
});

test('duplicate normalized registration returns EMAIL_IN_USE and rolls back reference guards', async () => {
  const app = fixture.app(); const account = await fixture.user();
  const before = await fixture.models.Hostel.findById(fixture.hostel._id);
  const res = await fixture.post(app, '/api/v1/auth/register').send(fixture.registration({ email: ` ${account.email.toUpperCase()} ` })).expect(409);
  code(res, 'EMAIL_IN_USE');
  expect(await fixture.models.User.countDocuments({ email: account.email })).toBe(1);
  expect((await fixture.models.Hostel.findById(before._id)).version).toBe(before.version);
});

test('concurrent duplicate registration creates exactly one student', async () => {
  const app = fixture.app(); const input = fixture.registration();
  const results = await Promise.all([1, 2].map(() => fixture.post(app, '/api/v1/auth/register').send(input)));
  expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
  code(results.find((res) => res.status === 409), 'EMAIL_IN_USE');
  expect(await fixture.models.User.countDocuments({ email: input.email })).toBe(1);
});

test('registration cannot race past reference deactivation', async () => {
  const app = fixture.app();
  const existing = await fixture.models.Hostel.findById(fixture.hostel._id).select('+enrollmentCodeHash');
  const hostel = await fixture.create('Hostel', hostelInput({ enrollmentCodeHash: existing.enrollmentCodeHash }));
  const block = await fixture.create('Block', blockInput({ hostelId: hostel._id }));
  const room = await fixture.create('Room', roomInput({ hostelId: hostel._id, blockId: block._id }));
  const input = fixture.registration({ hostelId: String(hostel._id), blockId: String(block._id), roomId: String(room._id) });
  let release; let reached; let paused = false;
  const barrier = new Promise((resolve) => { release = resolve; });
  const ready = new Promise((resolve) => { reached = resolve; });
  const original = fixture.models.Hostel.prototype.save;
  const spy = vi.spyOn(fixture.models.Hostel.prototype, 'save').mockImplementation(async function (...args) {
    if (!paused) { paused = true; reached(); await barrier; }
    return original.apply(this, args);
  });
  const pending = fixture.post(app, '/api/v1/auth/register').send(input).then((res) => res);
  try {
    await ready;
    await fixture.change('Hostel', hostel._id, (doc) => { doc.isActive = false; });
  } finally { release(); }
  const result = await pending;
  spy.mockRestore();
  expect(result.status).toBe(422); code(result, 'ENROLLMENT_INVALID');
  expect(await fixture.models.User.countDocuments({ email: input.email })).toBe(0);
  expect((await fixture.models.Block.findById(block._id)).version).toBe(1);
});

test.each(['role', 'status', 'mustChangePassword', 'adminHostelIds', 'categoryIds', 'ownerId', 'passwordHash', 'version'])(
  'registration rejects privilege escalation through %s', async (field) => {
    const input = fixture.registration();
    const res = await fixture.post(fixture.app(), '/api/v1/auth/register').send({ ...input, [field]: 'forged' }).expect(422);
    code(res, 'VALIDATION_ERROR');
    expect(await fixture.models.User.countDocuments({ email: input.email })).toBe(0);
  },
);

test.each(['hostel', 'block', 'room', 'wrongCode', 'missingHostel', 'missingBlock', 'missingRoom', 'crossHostel', 'crossBlock'])(
  'registration rejects %s enrollment with the same safe error', async (failure) => {
    const hostel = await fixture.create('Hostel', hostelInput({
      enrollmentCodeHash: (await fixture.models.Hostel.findById(fixture.hostel._id).select('+enrollmentCodeHash')).enrollmentCodeHash,
      isActive: failure !== 'hostel',
    }));
    const block = await fixture.create('Block', blockInput({ hostelId: hostel._id, isActive: failure !== 'block' }));
    const room = await fixture.create('Room', roomInput({ hostelId: hostel._id, blockId: block._id, isActive: failure !== 'room' }));
    const input = fixture.registration({ hostelId: String(hostel._id), blockId: String(block._id), roomId: String(room._id) });
    if (failure === 'wrongCode') input.enrollmentCode = 'WRONG-CODE-2026';
    if (failure === 'missingHostel') input.hostelId = String(objectId());
    if (failure === 'missingBlock') input.blockId = String(objectId());
    if (failure === 'missingRoom') input.roomId = String(objectId());
    if (failure === 'crossHostel') input.hostelId = String(fixture.hostel._id);
    if (failure === 'crossBlock') input.blockId = String(fixture.block._id);
    const res = await fixture.post(fixture.app(), '/api/v1/auth/register').send(input).expect(422);
    code(res, 'ENROLLMENT_INVALID');
    expect(res.body.error.message).toBe('Enrollment details are invalid.');
    expect(await fixture.models.User.countDocuments({ email: input.email })).toBe(0);
  },
);

test.each(['STUDENT', 'STAFF', 'ADMIN'])('%s login persists a seven-day hashed session and exposes only safe claims/profile', async (role) => {
  const app = fixture.app(); const account = await fixture.user({ role });
  const login = await fixture.login(app, account, { email: ` ${account.email.toUpperCase()} ` });
  const { res } = login; const payload = jwt.verify(login.token, fixture.config.JWT_SECRET);
  expect(res.body.data.expiresIn).toBe(600);
  expect(payload.exp - payload.iat).toBe(600);
  expect(payload.sub).toBe(String(account._id));
  expect(payload.role).toBe(role);
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.body.meta.requestId).toBe(res.headers['x-request-id']);
  const header = res.headers['set-cookie'][0];
  for (const attribute of ['HttpOnly', 'SameSite=Strict', 'Path=/api/v1/auth', 'Max-Age=604800']) expect(header).toContain(attribute);
  expect(header).not.toContain('Secure');
  expect(header).not.toContain('Domain=');
  const record = await fixture.models.Session.findById(payload.sid).select('+tokenHash +tokenFamily');
  expect(record.tokenHash).toMatch(/^\$2b\$12\$/);
  expect(record.expiresAt.getTime() - Date.now()).toBeGreaterThan(604790000);
  expect(await verifyRefreshToken(login.cookie.split('.').at(-1), record.tokenHash)).toBe(true);
  expect(JSON.stringify(res.body.data.user)).not.toMatch(/passwordHash|enrollmentCode|tokenHash|tokenFamily/);
  expect(JSON.stringify(res.body).includes(login.cookie.split('=')[1])).toBe(false);
  const first = await me(app, login.token).expect(200);
  const second = await me(app, login.token, '/api/v1/users/me').expect(200);
  expect(first.body.data).toEqual(second.body.data);
});

test('session audit fields are bounded and private', async () => {
  const app = fixture.app(); const account = await fixture.user();
  const res = await fixture.post(app, '/api/v1/auth/login').set('User-Agent', 'a'.repeat(300))
    .send({ email: account.email, password }).expect(200);
  const record = await fixture.models.Session.findById(jwt.decode(res.body.data.accessToken).sid).select('+userAgent +ipAddress');
  expect(record.userAgent).toHaveLength(256);
  expect(record.ipAddress).toBeTruthy();
  expect(JSON.stringify(res.body)).not.toMatch(/userAgent|ipAddress/);
});

test('unknown email, wrong password, and inactive wrong-password attempts have generic credential errors', async () => {
  const app = fixture.app(); const active = await fixture.user(); const inactive = await fixture.user({ status: 'INACTIVE' });
  for (const email of [fixture.newEmail(), active.email, inactive.email]) {
    code(await fixture.post(app, '/api/v1/auth/login').send({ email, password: 'Wrong password 2026' }).expect(401), 'INVALID_CREDENTIALS');
  }
  code(await fixture.post(app, '/api/v1/auth/login').send({ email: inactive.email, password }).expect(403), 'ACCOUNT_INACTIVE');
  expect(await fixture.models.Session.countDocuments({ userId: { $in: [active._id, inactive._id] } })).toBe(0);
});

test('refresh rotates the secret, preserves absolute expiry, and revokes the family on old-token reuse', async () => {
  const app = fixture.app(); const account = await fixture.user();
  const first = await fixture.login(app, account); const independent = await fixture.login(app, account);
  const before = await fixture.models.Session.findById(sid(first)).select('+tokenHash');
  const rotated = await refresh(app, first.cookie).expect(200);
  const replacement = rotated.headers['set-cookie'][0].split(';')[0];
  expect(replacement === first.cookie).toBe(false);
  const after = await fixture.models.Session.findById(sid(first)).select('+tokenHash');
  expect(after.tokenHash === before.tokenHash).toBe(false);
  expect(after.expiresAt).toEqual(before.expiresAt);
  expect(after.lastRefreshedAt >= before.lastRefreshedAt).toBe(true);
  await me(app, rotated.body.data.accessToken).expect(200);
  const reused = await refresh(app, first.cookie).expect(401);
  code(reused, 'REFRESH_REUSE_DETECTED'); cleared(reused);
  expect((await fixture.models.Session.findById(sid(first))).isRevoked).toBe(true);
  code(await me(app, first.token).expect(401), 'SESSION_INVALID');
  code(await me(app, rotated.body.data.accessToken).expect(401), 'SESSION_INVALID');
  code(await refresh(app, replacement).expect(401), 'SESSION_INVALID');
  await me(app, independent.token).expect(200);
});

test('simultaneous refreshes yield one success then family revocation (SR-T03)', async () => {
  const app = fixture.app(); const account = await fixture.user(); const login = await fixture.login(app, account);
  const results = await Promise.all([refresh(app, login.cookie), refresh(app, login.cookie)]);
  expect(results.map((res) => res.status).sort()).toEqual([200, 401]);
  code(results.find((res) => res.status === 401), 'REFRESH_REUSE_DETECTED');
  code(await me(app, results.find((res) => res.status === 200).body.data.accessToken).expect(401), 'SESSION_INVALID');
  expect((await fixture.models.Session.findById(sid(login))).isRevoked).toBe(true);
});

test('a secret differing only after byte 72 triggers refresh reuse detection', async () => {
  const app = fixture.app(); const login = await fixture.login(app, await fixture.user());
  const last = login.cookie.at(-1) === 'a' ? 'b' : 'a';
  code(await refresh(app, login.cookie.slice(0, -1) + last).expect(401), 'REFRESH_REUSE_DETECTED');
});

test('reuse revocation failure returns 503 without falsely reporting a revoked family', async () => {
  const app = fixture.app(); const login = await fixture.login(app, await fixture.user());
  await refresh(app, login.cookie).expect(200);
  const spy = vi.spyOn(fixture.models.Session.prototype, 'save').mockRejectedValue(new Error('PRIVATE_REVOCATION_FAILURE'));
  const res = await refresh(app, login.cookie).expect(503);
  spy.mockRestore();
  code(res, 'SERVICE_UNAVAILABLE');
  expect(res.headers['set-cookie']).toBeUndefined();
  expect((await fixture.models.Session.findById(sid(login))).isRevoked).toBe(false);
  code(await refresh(app, login.cookie).expect(401), 'REFRESH_REUSE_DETECTED');
});

test.each(['expired', 'revoked', 'inactive', 'missingUser', 'missingSession'])('%s database state denies refresh and protected access', async (state) => {
  const app = fixture.app(); const account = await fixture.user(); const login = await fixture.login(app, account);
  if (state === 'expired') await fixture.change('Session', sid(login), (doc) => { doc.expiresAt = new Date(Date.now() - 1000); });
  if (state === 'revoked') await fixture.change('Session', sid(login), (doc) => { doc.isRevoked = true; });
  if (state === 'inactive') await fixture.change('User', account._id, (doc) => { doc.status = 'INACTIVE'; });
  // Missing references are represented by separately minted valid JWTs/records,
  // without deleting real account/session data to arrange these cases.
  if (state === 'missingUser') {
    const { tokenHash, ...input } = require('../helpers/models.helper').sessionInput({ userId: objectId() });
    const record = await fixture.create('Session', { ...input, tokenHash });
    const token = jwt.sign({ sub: String(record.userId), sid: String(record._id), role: 'STUDENT', hostelId: null }, fixture.config.JWT_SECRET, { expiresIn: 600 });
    code(await me(app, token).expect(401), 'SESSION_INVALID');
    code(await refresh(app, `hf_refresh=v1.${record.tokenFamily}.${'a'.repeat(128)}`).expect(401), 'SESSION_INVALID');
    return;
  }
  if (state === 'missingSession') {
    const token = jwt.sign({ sub: String(account._id), sid: String(objectId()), role: 'STUDENT', hostelId: String(account.hostelId) }, fixture.config.JWT_SECRET, { expiresIn: 600 });
    code(await me(app, token).expect(401), 'SESSION_INVALID');
    const randomCookie = require('../../src/utils/tokens').newRefreshToken().cookie;
    code(await refresh(app, `hf_refresh=${randomCookie}`).expect(401), 'SESSION_INVALID');
    return;
  }
  const expected = state === 'inactive' ? [403, 'ACCOUNT_INACTIVE'] : [401, 'SESSION_INVALID'];
  code(await me(app, login.token).expect(expected[0]), expected[1]);
  const res = await refresh(app, login.cookie).expect(expected[0]); code(res, expected[1]); cleared(res);
});

test('malformed, absent and duplicate cookies never identify a family', async () => {
  const app = fixture.app(); const login = await fixture.login(app, await fixture.user());
  for (const cookie of ['', 'hf_refresh=invalid', `${login.cookie}; ${login.cookie}`, login.cookie + '.extra']) {
    const res = await refresh(app, cookie).expect(401); code(res, 'SESSION_INVALID'); cleared(res);
  }
  expect((await fixture.models.Session.findById(sid(login))).isRevoked).toBe(false);
});

test('protected routes require authentic unexpired tokens with a matching session user', async () => {
  const app = fixture.app(); const account = await fixture.user(); const login = await fixture.login(app, account);
  code(await request(app).get('/api/v1/auth/me').expect(401), 'AUTH_REQUIRED');
  for (const token of ['bad.token.value', jwt.sign({ sub: String(account._id), sid: sid(login), role: 'ADMIN', hostelId: null }, 'wrong-secret', { expiresIn: 600 }),
    jwt.sign({ sub: String(objectId()), sid: sid(login), role: 'STUDENT', hostelId: null }, fixture.config.JWT_SECRET, { expiresIn: 600 })]) {
    code(await me(app, token).expect(401), 'SESSION_INVALID');
  }
  const now = Math.floor(Date.now() / 1000);
  const expired = jwt.sign({ sub: String(account._id), sid: sid(login), role: 'STUDENT', hostelId: null, iat: now - 601, exp: now - 1 }, fixture.config.JWT_SECRET);
  code(await me(app, expired).expect(401), 'TOKEN_EXPIRED');
});

test('current database scopes and forced-change state override signed stale claims', async () => {
  const app = fixture.app(); const account = await fixture.user({ role: 'STAFF' }); const login = await fixture.login(app, account);
  const categoryId = objectId();
  await fixture.change('User', account._id, (doc) => { doc.categoryIds = [categoryId]; doc.mustChangePassword = true; });
  const res = await me(app, login.token).expect(200);
  expect(res.body.data.user.categoryIds).toEqual([String(categoryId)]);
  expect(res.body.data.user.mustChangePassword).toBe(true);
  code(await patch(app, login.token, { expectedVersion: res.body.data.user.version, name: 'Changed Staff' }).expect(403), 'PASSWORD_CHANGE_REQUIRED');
  await me(app, login.token, '/api/v1/users/me').expect(200);
  await refresh(app, login.cookie).expect(200);
  await changePassword(app, login.token).expect(204);
  const user = await fixture.models.User.findById(account._id);
  expect(user.mustChangePassword).toBe(false);
  await fixture.login(app, user, { password: 'New Auth password é 2026' });
});

test('logout is immediate and idempotent by cookie and by bearer; wrong cookie cannot revoke', async () => {
  const app = fixture.app(); const account = await fixture.user();
  const cookieSession = await fixture.login(app, account); const bearerSession = await fixture.login(app, account);
  const forged = cookieSession.cookie.slice(0, -1) + (cookieSession.cookie.at(-1) === 'a' ? 'b' : 'a');
  cleared(await logout(app, forged).expect(204));
  expect((await fixture.models.Session.findById(sid(cookieSession))).isRevoked).toBe(false);
  const result = await logout(app, cookieSession.cookie).expect(204); cleared(result); expect(result.text).toBe('');
  code(await me(app, cookieSession.token).expect(401), 'SESSION_INVALID');
  await logout(app, cookieSession.cookie).expect(204);
  cleared(await fixture.post(app, '/api/v1/auth/logout').set('Authorization', `Bearer ${bearerSession.token}`).send({}).expect(204));
  code(await me(app, bearerSession.token).expect(401), 'SESSION_INVALID');
  await fixture.post(app, '/api/v1/auth/logout').send({}).expect(204);
});

test('logout with both valid credentials revokes both addressed sessions', async () => {
  const app = fixture.app(); const account = await fixture.user();
  const a = await fixture.login(app, account); const b = await fixture.login(app, account);
  await fixture.post(app, '/api/v1/auth/logout').set('Cookie', a.cookie).set('Authorization', `Bearer ${b.token}`).send({}).expect(204);
  code(await me(app, a.token).expect(401), 'SESSION_INVALID');
  code(await me(app, b.token).expect(401), 'SESSION_INVALID');
});

test('profile updates only name/phone, increment version, preserve scope and reject stale/concurrent writes', async () => {
  const app = fixture.app(); const account = await fixture.user(); const other = await fixture.user();
  const login = await fixture.login(app, account); const initial = login.res.body.data.user;
  const updated = await patch(app, login.token, { expectedVersion: initial.version, name: '  New Name  ', phone: '+919876543210' }).expect(200);
  expect(updated.body.data.user).toMatchObject({ name: 'New Name', phone: '+919876543210', version: initial.version + 1,
    email: initial.email, hostelId: initial.hostelId, blockId: initial.blockId, roomId: initial.roomId, role: 'STUDENT' });
  expect((await fixture.models.User.findById(other._id)).name).toBe(other.name);
  code(await patch(app, login.token, { expectedVersion: initial.version, phone: null }).expect(409), 'VERSION_CONFLICT');
  const results = await Promise.all(['First update', 'Second update'].map((name) => patch(app, login.token, { expectedVersion: initial.version + 1, name })));
  expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
  const latest = await me(app, login.token).expect(200);
  expect(latest.body.data.user.version).toBe(initial.version + 2);
  const clearedPhone = await patch(app, login.token, { expectedVersion: latest.body.data.user.version, phone: null }).expect(200);
  expect(clearedPhone.body.data.user.phone).toBeNull();
});

test.each(['role', 'email', 'hostelId', 'roomId', 'status', 'password', 'ownerId', 'adminHostelIds'])(
  'profile rejects forbidden field %s', async (field) => {
    const app = fixture.app(); const login = await fixture.login(app, await fixture.user());
    code(await patch(app, login.token, { expectedVersion: login.res.body.data.user.version, name: 'Valid Name', [field]: 'forged' }).expect(422), 'VALIDATION_ERROR');
  },
);

test('password change verifies current password, rejects unchanged input, revokes every session and requires a new login', async () => {
  const app = fixture.app(); const account = await fixture.user(); const other = await fixture.user();
  const one = await fixture.login(app, account); const two = await fixture.login(app, account); const independent = await fixture.login(app, other);
  code(await changePassword(app, one.token, { currentPassword: 'Incorrect current password' }).expect(401), 'INVALID_CREDENTIALS');
  code(await changePassword(app, one.token, { newPassword: password }).expect(422), 'PASSWORD_UNCHANGED');
  expect(await fixture.models.Session.countDocuments({ userId: account._id, isRevoked: false })).toBe(2);
  const res = await changePassword(app, one.token).expect(204); cleared(res); expect(res.text).toBe('');
  expect(await fixture.models.Session.countDocuments({ userId: account._id, isRevoked: false })).toBe(0);
  for (const login of [one, two]) {
    code(await me(app, login.token).expect(401), 'SESSION_INVALID');
    code(await refresh(app, login.cookie).expect(401), 'SESSION_INVALID');
  }
  await me(app, independent.token).expect(200);
  code(await fixture.post(app, '/api/v1/auth/login').send({ email: account.email, password }).expect(401), 'INVALID_CREDENTIALS');
  await fixture.login(app, account, { password: 'New Auth password é 2026' });
});

test('password and all revocations roll back together on a session write failure', async () => {
  const app = fixture.app(); const account = await fixture.user();
  const one = await fixture.login(app, account); const two = await fixture.login(app, account);
  const original = fixture.models.Session.prototype.save; let writes = 0;
  const spy = vi.spyOn(fixture.models.Session.prototype, 'save').mockImplementation(function (...args) {
    if (this.isRevoked && ++writes === 2) throw new Error('PRIVATE_DATABASE_FAILURE');
    return original.apply(this, args);
  });
  const res = await changePassword(app, one.token).expect(503);
  spy.mockRestore();
  code(res, 'SERVICE_UNAVAILABLE'); expect(res.headers['set-cookie']).toBeUndefined();
  const accountAfter = await fixture.models.User.findById(account._id).select('+passwordHash');
  expect(await verifyPassword(password, accountAfter.passwordHash)).toBe(true);
  expect(await fixture.models.Session.countDocuments({ userId: account._id, isRevoked: false })).toBe(2);
  await me(app, two.token).expect(200);
});

test('login using a password verified before a concurrent password change cannot create a surviving session', async () => {
  const app = fixture.app(); const account = await fixture.user(); const active = await fixture.login(app, account);
  let release; let reached;
  const barrier = new Promise((resolve) => { release = resolve; });
  const ready = new Promise((resolve) => { reached = resolve; });
  const original = bcrypt.compare; let paused = false;
  const spy = vi.spyOn(bcrypt, 'compare').mockImplementation(async (...args) => {
    const result = await original(...args);
    if (!paused) { paused = true; reached(); await barrier; }
    return result;
  });
  const pending = fixture.post(app, '/api/v1/auth/login').send({ email: account.email, password }).then((res) => res);
  try {
    await ready;
    await changePassword(app, active.token).expect(204);
  } finally { release(); }
  code(await pending, 'INVALID_CREDENTIALS');
  spy.mockRestore();
  expect(await fixture.models.Session.countDocuments({ userId: account._id, isRevoked: false })).toBe(0);
});

test('a concurrent refresh cannot survive password-change revocation', async () => {
  const app = fixture.app(); const account = await fixture.user(); const active = await fixture.login(app, account);
  let release; let reached; let paused = false;
  const barrier = new Promise((resolve) => { release = resolve; });
  const ready = new Promise((resolve) => { reached = resolve; });
  const original = bcrypt.compare;
  const spy = vi.spyOn(bcrypt, 'compare').mockImplementation(async (...args) => {
    const result = await original(...args);
    if (!paused) { paused = true; reached(); await barrier; }
    return result;
  });
  const pending = refresh(app, active.cookie).then((res) => res);
  try {
    await ready;
    await changePassword(app, active.token).expect(204);
  } finally { release(); }
  const res = await pending;
  spy.mockRestore();
  expect(res.status).toBe(401); code(res, 'SESSION_INVALID');
  expect(await fixture.models.Session.countDocuments({ userId: account._id, isRevoked: false })).toBe(0);
});

test.each(['/api/v1/auth/register', '/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/logout', '/api/v1/users/me/password'])(
  '%s rejects missing or untrusted CSRF/Origin', async (path) => {
    const app = fixture.app();
    for (const headers of [{}, { Origin: fixture.config.CORS_ORIGIN }, { 'X-CSRF-Protection': '1' },
      { Origin: 'https://evil.example', 'X-CSRF-Protection': '1' }]) {
      code(await request(app).post(path).set(headers).send({}).expect(403), 'CSRF_INVALID');
    }
  },
);

test('auth boundaries reject unsafe queries, body tokens, nonempty GETs and malformed input before DB reads', async () => {
  const app = fixture.app();
  const spy = vi.spyOn(fixture.models.User, 'findOne');
  for (const input of [{ email: { $ne: null }, password }, { email: 'invalid', password }, { email: fixture.newEmail(), password: 'short' }]) {
    code(await fixture.post(app, '/api/v1/auth/login').send(input).expect(422), 'VALIDATION_ERROR');
  }
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
  code(await fixture.post(app, '/api/v1/auth/register').send(fixture.registration({ hostelId: 'bad' })).expect(422), 'VALIDATION_ERROR');
  code(await fixture.post(app, '/api/v1/auth/refresh').send({ token: 'private' }).expect(422), 'VALIDATION_ERROR');
  code(await fixture.post(app, '/api/v1/auth/logout').send({ sid: String(objectId()) }).expect(422), 'VALIDATION_ERROR');
  code(await fixture.post(app, '/api/v1/auth/login?email[$ne]=null').send({ email: fixture.newEmail(), password }).expect(422), 'VALIDATION_ERROR');
  const login = await fixture.login(app, await fixture.user());
  code(await me(app, login.token).send({}).expect(422), 'VALIDATION_ERROR');
  code(await me(app, login.token, '/api/v1/users/me?role=ADMIN').expect(422), 'VALIDATION_ERROR');
  code(await fixture.post(app, '/api/v1/auth/login').set('Content-Type', 'application/json').send('{').expect(400), 'MALFORMED_JSON');
  code(await fixture.post(app, '/api/v1/auth/login').send({ password: 'x'.repeat(33000) }).expect(413), 'PAYLOAD_TOO_LARGE');
});

test('production set/clear cookies match Secure, HttpOnly, Strict, path and configured domain', async () => {
  const app = fixture.app({ config: { ...fixture.config, COOKIE_SECURE: true, COOKIE_DOMAIN: 'example.test' } });
  const login = await fixture.login(app, await fixture.user());
  const setCookie = login.res.headers['set-cookie'][0];
  const res = await logout(app, login.cookie).expect(204);
  cleared(res);
  for (const cookie of [setCookie, res.headers['set-cookie'][0]]) {
    expect(cookie).toContain('Secure'); expect(cookie).toContain('Domain=example.test');
  }
});

test('failed logout never claims server revocation or clears the cookie', async () => {
  const app = fixture.app(); const login = await fixture.login(app, await fixture.user());
  const spy = vi.spyOn(fixture.models.Session.prototype, 'save').mockRejectedValue(new Error('PRIVATE_DATABASE_FAILURE'));
  const res = await logout(app, login.cookie).expect(503);
  spy.mockRestore();
  code(res, 'SERVICE_UNAVAILABLE');
  expect(res.headers['set-cookie']).toBeUndefined();
  expect((await fixture.models.Session.findById(sid(login))).isRevoked).toBe(false);
});

test('unavailable database fails closed even for logout with no credentials', async () => {
  const app = fixture.app({ database: { connection: { readyState: 0 } } });
  const res = await fixture.post(app, '/api/v1/auth/logout').send({}).expect(503);
  code(res, 'SERVICE_UNAVAILABLE');
  expect(res.headers['set-cookie']).toBeUndefined();
});

test('auth logs never serialize passwords, cookie secrets, JWTs, or database errors', async () => {
  let logs = '';
  const logger = createLogger({ LOG_LEVEL: 'info' }, { write: (value) => { logs += value; } });
  const app = fixture.app({ logger }); const account = await fixture.user(); const login = await fixture.login(app, account);
  await me(app, login.token).expect(200);
  const spy = vi.spyOn(fixture.models.Session, 'findOne').mockImplementation(() => { throw new Error('PRIVATE_DATABASE_FAILURE'); });
  await refresh(app, login.cookie).expect(503);
  spy.mockRestore();
  for (const secret of [password, enrollmentCode, login.token, login.cookie, 'PRIVATE_DATABASE_FAILURE']) expect(logs.includes(secret)).toBe(false);
  expect(logs).toContain('requestId');
  expect(logs).toContain('SERVICE_UNAVAILABLE');
});

test('public login/register share 30 attempts; refresh independently allows 20, with Retry-After', async () => {
  const app = fixture.app();
  for (let i = 0; i < 30; i++) await fixture.post(app, i % 2 ? '/api/v1/auth/register' : '/api/v1/auth/login').send({}).expect(422);
  const limited = await fixture.post(app, '/api/v1/auth/login').send({}).expect(429);
  code(limited, 'RATE_LIMITED'); expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  for (let i = 0; i < 20; i++) await fixture.post(app, '/api/v1/auth/refresh').send({}).expect(401);
  code(await fixture.post(app, '/api/v1/auth/refresh').send({}).expect(429), 'RATE_LIMITED');
});

test('read limit is shared across self routes and sessions but isolated by user', async () => {
  const app = fixture.app(); const account = await fixture.user(); const other = await fixture.user();
  const one = await fixture.login(app, account); const two = await fixture.login(app, account); const independent = await fixture.login(app, other);
  for (let i = 0; i < 120; i++) await me(app, i % 2 ? one.token : two.token, i % 2 ? '/api/v1/auth/me' : '/api/v1/users/me').expect(200);
  const limited = await me(app, two.token).expect(429); code(limited, 'RATE_LIMITED');
  expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  await me(app, independent.token).expect(200);
});

test('write limit counts failures per user and is shared with bearer logout', async () => {
  const app = fixture.app(); const login = await fixture.login(app, await fixture.user());
  for (let i = 0; i < 30; i++) await patch(app, login.token, { expectedVersion: 99999, name: 'Valid Name' }).expect(409);
  const limited = await fixture.post(app, '/api/v1/auth/logout').set('Authorization', `Bearer ${login.token}`).send({}).expect(429);
  code(limited, 'RATE_LIMITED');
  expect((await fixture.models.Session.findById(sid(login))).isRevoked).toBe(false);
});
