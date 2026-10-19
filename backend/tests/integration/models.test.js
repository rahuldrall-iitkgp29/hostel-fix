const { openModelDatabase } = require('../helpers/modelDatabase.helper');
const { runTransaction, updateWithVersion } = require('../../src/utils/transactions');
const { ensureDatabaseIndexes } = require('../../scripts/ensure-indexes');
const { inputs, ids, objectId, after, userInput, hostelInput, blockInput, roomInput, categoryInput,
  sessionInput, complaintInput, reopenedComplaintInput, activityInput, commentInput,
  attachmentInput, feedbackInput, policyInput } = require('../helpers/models.helper');
const project = require('../../src/models/projections');

let fixture; let models; let connection;
beforeAll(async () => {
  fixture = await openModelDatabase();
  ({ models, connection } = fixture);
}, 30000);
afterAll(async () => { await fixture?.close(); }, 30000);

const create = (name, input) => fixture.create(models[name], input ?? inputs[name]());
const transaction = (work) => runTransaction(connection, work);
const change = (name, doc, mutate, extra = {}) => transaction((session) => updateWithVersion(models[name], {
  filter: { _id: doc._id }, expectedVersion: doc.version, session, mutate, ...extra,
}));

const requiredIndexes = {
  User: [[{ email: 1 }, { unique: true }], [{ hostelId: 1, role: 1, status: 1 }], [{ role: 1, status: 1 }]],
  Session: [[{ userId: 1, isRevoked: 1 }], [{ tokenFamily: 1 }, { unique: true }], [{ expiresAt: 1 }, { expireAfterSeconds: 0 }]],
  Hostel: [[{ code: 1 }, { unique: true }], [{ isActive: 1 }]],
  Block: [[{ hostelId: 1, code: 1 }, { unique: true }], [{ hostelId: 1, isActive: 1 }]],
  Room: [[{ hostelId: 1, blockId: 1, label: 1 }, { unique: true }], [{ hostelId: 1, blockId: 1, isActive: 1 }]],
  Category: [[{ hostelId: 1, code: 1 }, { unique: true }], [{ hostelId: 1, isActive: 1 }]],
  Complaint: [[{ reference: 1 }, { unique: true }], [{ ownerId: 1, clientRequestId: 1 }, { unique: true }],
    [{ ownerId: 1, status: 1, createdAt: -1 }], [{ hostelId: 1, status: 1, createdAt: -1 }],
    [{ assigneeId: 1, status: 1 }, { sparse: true }], [{ hostelId: 1, responseDueAt: 1 }],
    [{ hostelId: 1, resolutionDueAt: 1 }], [{ hostelId: 1, categoryId: 1, status: 1 }]],
  Activity: [[{ complaintId: 1, occurredAt: 1, _id: 1 }]],
  Comment: [[{ complaintId: 1, createdAt: 1 }], [{ complaintId: 1, createdAt: 1, _id: 1 }]],
  Attachment: [[{ ownerId: 1, complaintId: 1 }], [{ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { complaintId: null } }], [{ complaintId: 1 }]],
  Feedback: [[{ complaintId: 1 }, { unique: true }], [{ complaintId: 1, isCurrent: 1 }], [{ complaintId: 1, cycleNumber: 1 }, { unique: true }]],
  HostelPolicy: [[{ hostelId: 1 }, { unique: true }]],
};

test.each(Object.keys(requiredIndexes))('%s indexes exist in real MongoDB with their required options', async (name) => {
  const indexes = await models[name].collection.listIndexes().toArray();
  for (const [key, options = {}] of requiredIndexes[name]) {
    const index = indexes.find((candidate) => JSON.stringify(candidate.key) === JSON.stringify(key));
    expect(index, `${name} ${JSON.stringify(key)}`).toMatchObject({ key, ...options });
  }
});

test('additive index runner is repeatable and preserves records and existing indexes', async () => {
  const hostel = await create('Hostel');
  const before = await models.Hostel.collection.listIndexes().toArray();
  await expect(ensureDatabaseIndexes({ config: fixture.config })).resolves.toBe(12);
  await expect(ensureDatabaseIndexes({ config: fixture.config })).resolves.toBe(12);
  expect(await models.Hostel.collection.listIndexes().toArray()).toEqual(before);
  expect((await models.Hostel.findById(hostel._id)).version).toBe(1);
});

test('normalized user email and hostel code are unique', async () => {
  const user = await create('User');
  await expect(create('User', userInput({ email: ` ${user.email.toUpperCase()} ` }))).rejects.toMatchObject({ code: 11000 });
  const hostel = await create('Hostel');
  await expect(create('Hostel', hostelInput({ code: hostel.code.toLowerCase() }))).rejects.toMatchObject({ code: 11000 });
});

test.each([
  ['Block', blockInput, { code: 'ALPHA' }], ['Room', roomInput, { label: 'A-101' }], ['Category', categoryInput, { code: 'ELECTRICAL' }],
])('%s uniqueness is enforced within its parent scope and permits another hostel', async (name, input, key) => {
  const hostelId = objectId(); const blockId = objectId();
  const scoped = name === 'Room' ? { hostelId, blockId, ...key } : { hostelId, ...key };
  await create(name, input(scoped));
  await expect(create(name, input(scoped))).rejects.toMatchObject({ code: 11000 });
  await expect(create(name, input({ ...scoped, hostelId: objectId() }))).resolves.toBeDefined();
});

test('refresh family is unique, including revoked sessions, until expiry cleanup', async () => {
  const session = await create('Session');
  const revoked = await change('Session', session, (doc) => { doc.isRevoked = true; });
  expect(revoked.version).toBe(2);
  await expect(create('Session', sessionInput({ tokenFamily: session.tokenFamily, userId: objectId() }))).rejects.toMatchObject({ code: 11000 });
});

test('complaint reference is unique; create idempotency is unique per owner, not globally', async () => {
  const complaint = await create('Complaint');
  await expect(create('Complaint', complaintInput({ reference: complaint.reference, ownerId: objectId() }))).rejects.toMatchObject({ code: 11000 });
  await expect(create('Complaint', complaintInput({ ownerId: complaint.ownerId, clientRequestId: complaint.clientRequestId }))).rejects.toMatchObject({ code: 11000 });
  await expect(create('Complaint', complaintInput({ ownerId: objectId(), clientRequestId: complaint.clientRequestId }))).resolves.toBeDefined();
  // Sparse does not mean a null assignee is unique: many unassigned reports work.
  expect(await models.Complaint.countDocuments({ assigneeId: null })).toBeGreaterThanOrEqual(2);
});

test('feedback is one replaceable document per complaint, including across cycles', async () => {
  const complaintId = objectId();
  const feedback = await create('Feedback', feedbackInput({ complaintId }));
  await expect(create('Feedback', feedbackInput({ complaintId }))).rejects.toMatchObject({ code: 11000 });
  await expect(create('Feedback', feedbackInput({ complaintId, cycleNumber: 2 }))).rejects.toMatchObject({ code: 11000 });
  const invalidated = await change('Feedback', feedback, (doc) => { doc.isCurrent = false; });
  const replacement = await change('Feedback', invalidated, (doc) => { doc.rating = 4; doc.cycleNumber = 2; doc.isCurrent = true; });
  expect(String(replacement._id)).toBe(String(feedback._id));
  expect(await models.Feedback.countDocuments({ complaintId })).toBe(1);
});

test('hostel policy is unique; policy edits increment both versions and leave complaint snapshots unchanged', async () => {
  const hostelId = objectId();
  const policy = await create('HostelPolicy', policyInput({ hostelId }));
  await expect(create('HostelPolicy', policyInput({ hostelId }))).rejects.toMatchObject({ code: 11000 });
  const complaint = await create('Complaint', complaintInput({ slaPolicy: policy.slaTargets.toObject() }));
  const updated = await change('HostelPolicy', policy, (doc) => { doc.slaTargets.HIGH.responseMinutes = 240; });
  expect(updated.version).toBe(2); expect(updated.policyVersion).toBe(2);
  expect((await models.Complaint.findById(complaint._id)).slaPolicy.HIGH.responseMinutes).toBe(480);
});

test('secret fields are excluded from database queries, lean results and explicit projections after opt-in', async () => {
  const user = await create('User'); const hostel = await create('Hostel'); const session = await create('Session');
  const attachment = await create('Attachment'); const complaint = await create('Complaint');
  for (const [name, doc, fields] of [
    ['User', user, ['passwordHash', 'enrollmentCodeHash']], ['Hostel', hostel, ['enrollmentCodeHash']],
    ['Session', session, ['tokenFamily', 'tokenHash', 'userAgent', 'ipAddress']],
    ['Attachment', attachment, ['storageKey']], ['Complaint', complaint, ['clientRequestHash']],
  ]) {
    const lean = await models[name].findById(doc._id).lean();
    for (const field of fields) expect(lean).not.toHaveProperty(field);
    const selected = await models[name].findById(doc._id).select(fields.map((field) => `+${field}`).join(' '));
    for (const field of fields) expect(JSON.stringify(selected)).not.toContain(field);
  }
});

test('timestamps persist and versioned saves cannot silently overwrite a stale document', async () => {
  const user = await create('User');
  expect(user.createdAt).toBeInstanceOf(Date); expect(user.updatedAt).toBeInstanceOf(Date);
  const updated = await change('User', user, (doc) => { doc.name = 'Updated Resident'; });
  expect(updated.version).toBe(2);
  expect(updated.createdAt).toEqual(user.createdAt);
  expect(+updated.updatedAt).toBeGreaterThanOrEqual(+user.updatedAt);
  await expect(change('User', user, (doc) => { doc.name = 'Stale Resident'; })).rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
  const read = await models.User.findById(user._id);
  read.name = 'Unsafe save';
  await expect(read.save()).rejects.toThrow('require a transaction');
  expect((await models.User.findById(user._id)).name).toBe('Updated Resident');
});

test('scope is checked before version and an out-of-scope record is hidden', async () => {
  const complaint = await create('Complaint');
  const mutate = vi.fn();
  await expect(change('Complaint', complaint, mutate, {
    filter: { _id: complaint._id, ownerId: objectId() }, expectedVersion: 999,
  })).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  expect(mutate).not.toHaveBeenCalled();
  expect((await models.Complaint.findById(complaint._id)).version).toBe(1);
});

test('immutable identity fields cannot be changed by a document save', async () => {
  const user = await create('User');
  await expect(change('User', user, (doc) => { doc.role = 'ADMIN'; })).rejects.toThrow('immutable');
  expect((await models.User.findById(user._id)).role).toBe('STUDENT');
  const complaint = await create('Complaint');
  for (const [field, value] of [['ownerId', objectId()], ['hostelId', objectId()], ['reference', 'HFX-2026-AAAAAAAAAA']]) {
    await expect(change('Complaint', complaint, (doc) => { doc[field] = value; })).rejects.toThrow('immutable');
    expect(String((await models.Complaint.findById(complaint._id))[field])).toBe(String(complaint[field]));
  }
  await expect(change('Complaint', complaint, (doc) => { doc.attachmentIds.push(objectId()); })).rejects.toThrow('attachments cannot be changed');
  expect((await models.Complaint.findById(complaint._id)).attachmentIds).toHaveLength(0);
});

test('reference/block mutations can share the required parent Hostel version guard', async () => {
  const hostel = await create('Hostel');
  const block = await create('Block', blockInput({ hostelId: hostel._id }));
  await transaction(async (session) => {
    await updateWithVersion(models.Hostel, { filter: { _id: hostel._id }, expectedVersion: 1, session });
    await updateWithVersion(models.Block, { filter: { _id: block._id, hostelId: hostel._id }, expectedVersion: 1,
      session, mutate: (doc) => { doc.name = 'Renamed Alpha'; } });
  });
  expect((await models.Hostel.findById(hostel._id)).version).toBe(2);
  expect((await models.Block.findById(block._id))).toMatchObject({ name: 'Renamed Alpha', version: 2 });
  await expect(transaction(async (session) => {
    await updateWithVersion(models.Hostel, { filter: { _id: hostel._id }, expectedVersion: 1, session });
    await updateWithVersion(models.Block, { filter: { _id: block._id }, expectedVersion: 2, session, mutate: (doc) => { doc.name = 'Stale rename'; } });
  })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  expect((await models.Block.findById(block._id)).name).toBe('Renamed Alpha');
});

test('existing cycle policies/prior history are immutable and deadlines can only tighten', async () => {
  const complaint = await create('Complaint');
  await expect(change('Complaint', complaint, (doc) => { doc.slaPolicy.HIGH.responseMinutes = 240; })).rejects.toThrow('cannot change policy');
  const tightened = await change('Complaint', complaint, (doc) => { doc.responseDueAt = after(240); });
  await expect(change('Complaint', tightened, (doc) => { doc.responseDueAt = after(300); })).rejects.toThrow('extend deadlines');
  expect((await models.Complaint.findById(complaint._id)).responseDueAt).toEqual(after(240));
  const reopened = await create('Complaint', reopenedComplaintInput());
  await expect(change('Complaint', reopened, (doc) => { doc.priorCycles[0].resolutionNote = 'An attempt to rewrite the old repair history.'; })).rejects.toThrow('history cannot be changed');
  const responded = await change('Complaint', tightened, (doc) => { doc.firstRespondedAt = after(15); });
  await expect(change('Complaint', responded, (doc) => { doc.firstRespondedAt = after(20); })).rejects.toThrow('only once per cycle');
});

test('staged expiry is about sixty minutes; binding clears it and prevents reuse/deletion', async () => {
  const attachment = await create('Attachment');
  expect(attachment.expiresAt - attachment.createdAt).toBeGreaterThan(3590000);
  expect(attachment.expiresAt - attachment.createdAt).toBeLessThanOrEqual(3600000);
  const bound = await change('Attachment', attachment, (doc) => { doc.complaintId = ids.complaint; doc.expiresAt = null; });
  expect(bound.expiresAt).toBeNull();
  await expect(change('Attachment', bound, (doc) => { doc.complaintId = objectId(); })).rejects.toThrow();
  await expect(transaction((session) => models.Attachment.deleteOne({ _id: bound._id }, { session }))).rejects.toThrow('Bound attachments');
  const staged = await create('Attachment');
  await expect(transaction((session) => models.Attachment.deleteOne({ _id: staged._id }, { session }))).resolves.toMatchObject({ deletedCount: 1 });
  expect(await models.Attachment.findById(bound._id)).not.toBeNull();
  expect(await models.Attachment.findById(staged._id)).toBeNull();
});

const forbiddenMutations = [
  ['updateOne', (Model, doc) => Model.updateOne({ _id: doc._id }, { $set: { version: 2 } })],
  ['updateMany', (Model, doc) => Model.updateMany({ _id: doc._id }, { $set: { version: 2 } })],
  ['findOneAndUpdate', (Model, doc) => Model.findOneAndUpdate({ _id: doc._id }, { $set: { version: 2 } })],
  ['replaceOne', (Model, doc) => Model.replaceOne({ _id: doc._id }, {})],
  ['findOneAndReplace', (Model, doc) => Model.findOneAndReplace({ _id: doc._id }, {})],
  ['deleteOne', (Model, doc) => Model.deleteOne({ _id: doc._id })],
  ['deleteMany', (Model, doc) => Model.deleteMany({ _id: doc._id })],
  ['findOneAndDelete', (Model, doc) => Model.findOneAndDelete({ _id: doc._id })],
  ['document delete', (_Model, doc) => doc.deleteOne()],
  ['bulkWrite', (Model, doc) => Model.bulkWrite([{ deleteOne: { filter: { _id: doc._id } } }], { skipValidation: true })],
  ['insertMany', (Model, doc) => Model.insertMany([doc.toObject()], { lean: true })],
  ['aggregate merge', (Model, doc) => Model.aggregate([{ $match: { _id: doc._id } }, { $merge: Model.collection.name }])],
  ['aggregate out', (Model, doc) => Model.aggregate([{ $match: { _id: doc._id } }, { $out: Model.collection.name }])],
];
describe.each(['Activity', 'Comment'])('%s append-only enforcement', (name) => {
  let doc;
  beforeAll(async () => { doc = await create(name); });
  test.each(forbiddenMutations)('rejects %s', async (_operation, mutate) => {
    await expect(mutate(models[name], doc)).rejects.toThrow();
    expect((await models[name].findById(doc._id)).version).toBe(1);
  });
  test('rejects saving an existing record even in a transaction', async () => {
    await expect(transaction(async (session) => {
      const loaded = await models[name].findById(doc._id).session(session);
      await loaded.save({ session });
    })).rejects.toThrow('Append-only');
  });
});

test.each(['Complaint', 'Activity', 'Comment', 'Feedback'])('%s creation cannot escape its required transaction', async (name) => {
  const doc = fixture.track(models[name], inputs[name]());
  await expect(doc.save()).rejects.toThrow('requires a transaction');
  expect(await models[name].findById(doc._id)).toBeNull();
});

test('new document versions, direct version edits and disabled validation cannot bypass the guards', async () => {
  await expect(create('Hostel', hostelInput({ version: 2 }))).rejects.toThrow('start at version 1');
  const hostel = await create('Hostel');
  await expect(change('Hostel', hostel, (doc) => { doc.version = 8; })).rejects.toThrow('assign version directly');
  await expect(transaction((session) => hostel.save({ session, validateBeforeSave: false }))).rejects.toThrow('validation cannot be disabled');
  expect((await models.Hostel.findById(hostel._id)).version).toBe(1);
});

test('a real transaction isolates and commits complaint plus activity together', async () => {
  let complaint; let event;
  await transaction(async (session) => {
    complaint = await fixture.save(models.Complaint, complaintInput(), session);
    event = await fixture.save(models.Activity, activityInput({ complaintId: complaint._id }), session);
    expect(await models.Complaint.findById(complaint._id)).toBeNull();
    expect(await models.Activity.findById(event._id)).toBeNull();
    expect(await models.Complaint.findById(complaint._id).session(session)).not.toBeNull();
  });
  expect(await models.Complaint.findById(complaint._id)).not.toBeNull();
  expect(await models.Activity.findById(event._id)).not.toBeNull();
});

test('failed transactions roll back state, version, comment, activity and feedback together', async () => {
  const complaint = await create('Complaint');
  const commentId = objectId(); const eventId = objectId(); const feedbackId = objectId();
  await expect(transaction(async (session) => {
    await updateWithVersion(models.Complaint, { filter: { _id: complaint._id, ownerId: complaint.ownerId }, expectedVersion: 1, session,
      mutate: (doc) => { doc.title = 'A title that must be rolled back'; } });
    await fixture.save(models.Comment, commentInput({ _id: commentId, complaintId: complaint._id }), session);
    await fixture.save(models.Activity, activityInput({ _id: eventId, complaintId: complaint._id, type: 'COMMENT_ADDED' }), session);
    await fixture.save(models.Feedback, feedbackInput({ _id: feedbackId, complaintId: complaint._id }), session);
    throw new Error('Injected failure after all writes');
  })).rejects.toThrow('Injected failure');
  const unchanged = await models.Complaint.findById(complaint._id);
  expect(unchanged.version).toBe(1); expect(unchanged.title).toBe(complaint.title);
  expect(await models.Comment.findById(commentId)).toBeNull();
  expect(await models.Activity.findById(eventId)).toBeNull();
  expect(await models.Feedback.findById(feedbackId)).toBeNull();
});

test('concurrent commands with one expectedVersion commit exactly one comment/event and return a conflict', async () => {
  const complaint = await create('Complaint');
  let arrived = 0; let release;
  const bothRead = new Promise((resolve) => { release = resolve; });
  const command = () => transaction((session) => updateWithVersion(models.Complaint, {
    filter: { _id: complaint._id, ownerId: complaint.ownerId }, expectedVersion: 1, session,
    mutate: async () => {
      arrived += 1; if (arrived === 2) release();
      await bothRead;
      await fixture.save(models.Comment, commentInput({ complaintId: complaint._id }), session);
      await fixture.save(models.Activity, activityInput({ complaintId: complaint._id, type: 'COMMENT_ADDED' }), session);
    },
  }));
  const results = await Promise.allSettled([command(), command()]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((result) => result.status === 'rejected').reason).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
  expect((await models.Complaint.findById(complaint._id)).version).toBe(2);
  expect(await models.Comment.countDocuments({ complaintId: complaint._id })).toBe(1);
  expect(await models.Activity.countDocuments({ complaintId: complaint._id })).toBe(1);
}, 15000);

test('timeline ties sort by ID and actor snapshots survive account name changes', async () => {
  const user = await create('User'); const complaintId = objectId();
  const first = await create('Activity', activityInput({ complaintId, actorId: user._id, actorName: user.name, actorRole: user.role }));
  const second = await create('Activity', activityInput({ complaintId, actorId: user._id, actorName: user.name, actorRole: user.role }));
  await change('User', user, (doc) => { doc.name = 'New Profile Name'; });
  const events = await models.Activity.find({ complaintId }).sort({ occurredAt: 1, _id: 1 });
  expect(events.map((event) => String(event._id))).toEqual([String(first._id), String(second._id)].sort());
  expect(events.map((event) => project.activity(event).actor.name)).toEqual([user.name, user.name]);
});
