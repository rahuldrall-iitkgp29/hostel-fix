const mongoose = require('mongoose');
const { createModels } = require('../../src/models');
const {
  ROLES,
  STATUSES,
  OPEN_STATUSES,
  TERMINAL_STATUSES,
} = require('../../src/models/enums');
const {
  inputs,
  ids,
  objectId,
  userInput,
  policyInput,
  complaintInput,
  resolvedComplaintInput,
  reopenedComplaintInput,
  sessionInput,
  after,
  attachmentInput,
} = require('../helpers/models.helper');

const connection = mongoose.createConnection();
const models = createModels(connection);
afterAll(() => connection.destroy());

test('model registration is connection-local, repeatable and covers the twelve P0 models', () => {
  expect(Object.keys(models)).toHaveLength(12);
  expect(createModels(connection).User).toBe(models.User);
  expect(mongoose.modelNames()).toEqual([]);
  expect(connection.readyState).toBe(0);
  expect(ROLES).toEqual(['STUDENT', 'STAFF', 'ADMIN']);
  expect(STATUSES).toEqual([
    'SUBMITTED',
    'TRIAGED',
    'ASSIGNED',
    'IN_PROGRESS',
    'RESOLVED',
    'CLOSED',
    'REOPENED',
    'REJECTED',
  ]);
  expect(OPEN_STATUSES).not.toContain('RESOLVED');
  expect(TERMINAL_STATUSES).toEqual(['CLOSED', 'REJECTED']);
});

test.each(Object.keys(inputs))(
  '%s validates complete fixtures and starts at version 1',
  async (name) => {
    const doc = new models[name](inputs[name]());
    await expect(doc.validate()).resolves.toBeUndefined();
    expect(doc.version).toBe(1);
    expect(doc._id).toBeInstanceOf(mongoose.Types.ObjectId);
  }
);

test.each(Object.keys(inputs))(
  '%s rejects unknown schema fields and fractional versions',
  async (name) => {
    expect(
      () => new models[name]({ ...inputs[name](), arbitraryScope: 'injected' })
    ).toThrow();
    await expect(
      new models[name]({ ...inputs[name](), version: 1.5 }).validate()
    ).rejects.toThrow();
  }
);

test.each(ROLES)(
  '%s has one role-specific profile, without duplicate profile documents',
  async (role) => {
    const user = new models.User(userInput({ role }));
    await user.validate();
    expect(user.role).toBe(role);
    expect(user.adminHostelIds).toHaveLength(role === 'ADMIN' ? 1 : 0);
    expect(user.categoryIds).toHaveLength(role === 'STAFF' ? 1 : 0);
  }
);

test('normalizes email, names and catalog codes/labels, without changing hash values', async () => {
  const user = new models.User(
    userInput({ name: '  Test Resident  ', email: '  RESIDENT@Example.Test ' })
  );
  const room = new models.Room(inputs.Room({ label: ' a-102 ' }));
  const category = new models.Category(inputs.Category({ code: 'electrical' }));
  await user.validate();
  await room.validate();
  await category.validate();
  expect(user.name).toBe('Test Resident');
  expect(user.email).toBe('resident@example.test');
  expect(user.passwordHash).toBe(userInput().passwordHash);
  expect(room.label).toBe('A-102');
  expect(category.code).toBe('ELECTRICAL');
});

test.each([
  ['missing student room', { roomId: null }],
  ['student staff categories', { categoryIds: [ids.category] }],
  ['student admin scopes', { adminHostelIds: [ids.hostel] }],
  ['bad email', { email: 'invalid' }],
  ['bad phone', { phone: '9876543210' }],
  ['plaintext password', { passwordHash: 'plaintext-password' }],
  ['staff without categories', { role: 'STAFF', categoryIds: [] }],
  [
    'duplicate categories',
    { role: 'STAFF', categoryIds: [ids.category, ids.category] },
  ],
  ['staff room', { role: 'STAFF', roomId: ids.room }],
  ['admin without scopes', { role: 'ADMIN', adminHostelIds: [] }],
  ['admin hostel', { role: 'ADMIN', hostelId: ids.hostel }],
  ['null scopes', { adminHostelIds: null }],
  ['invalid role', { role: 'SUPER_ADMIN' }],
  ['invalid reference', { hostelId: 'not-an-id' }],
])('rejects %s', async (_label, overrides) => {
  await expect(
    new models.User(userInput(overrides)).validate()
  ).rejects.toThrow();
});

test('session family is UUID v4, audit user agent is bounded, and refresh time starts at creation', async () => {
  const session = new models.Session(
    sessionInput({ userAgent: 'a'.repeat(300) })
  );
  await session.validate();
  expect(session.userAgent).toHaveLength(256);
  expect(session.lastRefreshedAt).toEqual(session.createdAt);
  await expect(
    new models.Session(
      sessionInput({ tokenFamily: 'aaaaaaaa-aaaa-1aaa-8aaa-aaaaaaaaaaaa' })
    ).validate()
  ).rejects.toThrow();
  await expect(
    new models.Session(
      sessionInput({ tokenHash: 'raw-refresh-token' })
    ).validate()
  ).rejects.toThrow();
});

test.each([
  { type: 'ROOM', hostelId: ids.hostel, blockId: ids.block, roomId: ids.room },
  {
    type: 'BLOCK_COMMON',
    hostelId: ids.hostel,
    blockId: ids.block,
    areaLabel: 'Main stairwell',
  },
  { type: 'HOSTEL_COMMON', hostelId: ids.hostel, areaLabel: 'Hostel entrance' },
])('accepts the $type location shape', async (location) => {
  await expect(
    new models.Complaint(complaintInput({ location })).validate()
  ).resolves.toBeUndefined();
});

test.each([
  [
    'room without block',
    { type: 'ROOM', hostelId: ids.hostel, roomId: ids.room },
  ],
  [
    'room area',
    {
      type: 'ROOM',
      hostelId: ids.hostel,
      blockId: ids.block,
      roomId: ids.room,
      areaLabel: 'Extra area',
    },
  ],
  [
    'block room',
    {
      type: 'BLOCK_COMMON',
      hostelId: ids.hostel,
      blockId: ids.block,
      roomId: ids.room,
      areaLabel: 'Stairs',
    },
  ],
  [
    'hostel block',
    {
      type: 'HOSTEL_COMMON',
      hostelId: ids.hostel,
      blockId: ids.block,
      areaLabel: 'Entrance',
    },
  ],
  [
    'wrong hostel',
    { type: 'HOSTEL_COMMON', hostelId: objectId(), areaLabel: 'Entrance' },
  ],
])('rejects %s location', async (_label, location) => {
  await expect(
    new models.Complaint(complaintInput({ location })).validate()
  ).rejects.toThrow();
});

test.each([
  ['short title', { title: 'Too short'.slice(0, 7) }],
  ['short description', { description: 'Bad fan' }],
  ['reference format', { reference: 'HFX-2026-short' }],
  ['invalid UUID', { clientRequestId: 'not-a-uuid' }],
  ['hash format', { clientRequestHash: 'not-sha256' }],
  ['status', { status: 'PENDING' }],
  ['priority', { priority: 'URGENT' }],
  ['priority source', { prioritySource: 'CLIENT' }],
  ['missing indicators', { indicators: undefined }],
  ['incomplete indicators', { indicators: { safetyRisk: false } }],
  [
    'string indicators',
    {
      indicators: { ...complaintInput().indicators, functionalityLoss: 'true' },
    },
  ],
  [
    'extra indicator',
    { indicators: { ...complaintInput().indicators, urgent: true } },
  ],
  [
    'too many attachments',
    { attachmentIds: [objectId(), objectId(), objectId(), objectId()] },
  ],
  ['duplicate attachments', { attachmentIds: [ids.room, ids.room] }],
  ['assigned without staff', { status: 'ASSIGNED' }],
  ['submitted with staff', { assigneeId: ids.staff }],
  ['unrecorded reopen', { cycleNumber: 2, reopenCount: 1 }],
  ['reopen limit', { reopenCount: 3, cycleNumber: 4 }],
  ['unordered deadlines', { resolutionDueAt: after(1) }],
  ['unresolved with resolution', { resolvedAt: after(60) }],
  ['missing SLA snapshot', { slaPolicy: undefined }],
  ['mismatched rule priority', { priority: 'CRITICAL' }],
  ['response before cycle', { firstRespondedAt: after(-1) }],
])('rejects complaint %s', async (_label, overrides) => {
  await expect(
    new models.Complaint(complaintInput(overrides)).validate()
  ).rejects.toThrow();
});

test('accepts resolved/reopened records with bounded auditable cycle snapshots', async () => {
  await expect(
    new models.Complaint(resolvedComplaintInput()).validate()
  ).resolves.toBeUndefined();
  await expect(
    new models.Complaint(reopenedComplaintInput()).validate()
  ).resolves.toBeUndefined();
  const invalid = reopenedComplaintInput();
  delete invalid.priorCycles[0].slaPolicy;
  await expect(new models.Complaint(invalid).validate()).rejects.toThrow();
  await expect(
    new models.Complaint(
      resolvedComplaintInput({ reopenUntil: after(70) })
    ).validate()
  ).rejects.toThrow();
  await expect(
    new models.Complaint(
      reopenedComplaintInput({ reopenedAt: after(121) })
    ).validate()
  ).rejects.toThrow();
  const disconnectedHistory = reopenedComplaintInput();
  disconnectedHistory.priorCycles[0].startedAt = after(-10);
  await expect(
    new models.Complaint(disconnectedHistory).validate()
  ).rejects.toThrow();
});

test.each([
  [
    'missing priority',
    (policy) => {
      delete policy.slaTargets.HIGH;
    },
  ],
  [
    'zero target',
    (policy) => {
      policy.slaTargets.CRITICAL.responseMinutes = 0;
    },
  ],
  [
    'fractional target',
    (policy) => {
      policy.slaTargets.CRITICAL.responseMinutes = 1.1;
    },
  ],
  [
    'response after resolution',
    (policy) => {
      policy.slaTargets.CRITICAL.responseMinutes = 600;
    },
  ],
  [
    'relaxed higher priority',
    (policy) => {
      policy.slaTargets.CRITICAL.resolutionMinutes = 2000;
    },
  ],
  [
    'excessive target',
    (policy) => {
      policy.slaTargets.LOW.resolutionMinutes = 43201;
    },
  ],
  [
    'unknown priority',
    (policy) => {
      policy.slaTargets.URGENT = policy.slaTargets.HIGH;
    },
  ],
  [
    'nonpositive weight',
    (policy) => {
      policy.priorityWeights.safetyRisk = 0;
    },
  ],
  [
    'unordered thresholds',
    (policy) => {
      policy.priorityThresholds.HIGH = 8;
    },
  ],
])('rejects policy %s', async (_label, change) => {
  const input = policyInput();
  change(input);
  await expect(new models.HostelPolicy(input).validate()).rejects.toThrow();
});

test.each([
  ['unsupported MIME', { mimeType: 'image/gif' }],
  ['oversize file', { sizeBytes: 5 * 1024 * 1024 + 1 }],
  ['zero size', { sizeBytes: 0 }],
  ['dimension', { width: 6001 }],
  ['pixel count', { width: 6000, height: 2001 }],
  ['unsafe original name', { originalName: '../fan.png' }],
  ['header injection', { originalName: 'fan\r\n.png' }],
  ['unsafe key', { storageKey: '../outside.png' }],
  [
    'expired bound record',
    { complaintId: ids.complaint, expiresAt: after(60) },
  ],
  ['unexpiring staged record', { expiresAt: null }],
])('rejects attachment %s', async (_label, overrides) => {
  await expect(
    new models.Attachment(attachmentInput(overrides)).validate()
  ).rejects.toThrow();
});

test('feedback rating is an integer in range and events validate actor snapshots/change payloads', async () => {
  for (const rating of [0, 6, 1.5])
    await expect(
      new models.Feedback(inputs.Feedback({ rating })).validate()
    ).rejects.toThrow();
  await expect(
    new models.Activity(inputs.Activity({ actorId: ids.student })).validate()
  ).rejects.toThrow();
  await expect(
    new models.Activity(
      inputs.Activity({ type: 'FEEDBACK_SUBMITTED', changes: { rating: 6 } })
    ).validate()
  ).rejects.toThrow();
  await expect(
    new models.Activity(
      inputs.Activity({ changes: { passwordHash: 'private' } })
    ).validate()
  ).rejects.toThrow();
  await expect(
    new models.Comment(inputs.Comment({ authorRole: 'SYSTEM' })).validate()
  ).rejects.toThrow();
});
