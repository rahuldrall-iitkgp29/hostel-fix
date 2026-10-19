const { Types } = require('mongoose');
const { randomUUID, createHash } = require('node:crypto');

const objectId = () => new Types.ObjectId();
const ids = Object.fromEntries(['hostel', 'block', 'room', 'category', 'student', 'staff', 'admin', 'complaint'].map((key) => [key, objectId()]));
// Syntactically valid, deliberately synthetic hashes. No credential is created.
const passwordHash = '$2b$12$' + 'a'.repeat(53);
const enrollmentCodeHash = '$2b$10$' + 'b'.repeat(53);
const tokenHash = '$2b$12$' + 'c'.repeat(53);
const start = new Date('2026-10-19T00:00:00.000Z');
const after = (minutes, from = start) => new Date(from.getTime() + minutes * 60000);

function policyInput(overrides = {}) {
  return {
    hostelId: ids.hostel,
    slaTargets: {
      CRITICAL: { responseMinutes: 120, resolutionMinutes: 480 },
      HIGH: { responseMinutes: 480, resolutionMinutes: 1440 },
      MEDIUM: { responseMinutes: 480, resolutionMinutes: 2880 },
      LOW: { responseMinutes: 1440, resolutionMinutes: 4320 },
    },
    priorityWeights: { safetyRisk: 4, essentialServiceOutage: 3, affectsMultipleRooms: 2, functionalityLoss: 1 },
    priorityThresholds: { CRITICAL: 7, HIGH: 4, MEDIUM: 1 },
    ...overrides,
  };
}

function userInput(overrides = {}) {
  const role = overrides.role ?? 'STUDENT';
  return {
    name: 'Test Resident', email: `model-${randomUUID()}@example.test`, passwordHash, role,
    hostelId: role === 'ADMIN' ? null : ids.hostel,
    blockId: role === 'STUDENT' ? ids.block : null,
    roomId: role === 'STUDENT' ? ids.room : null,
    categoryIds: role === 'STAFF' ? [ids.category] : [],
    adminHostelIds: role === 'ADMIN' ? [ids.hostel] : [],
    ...overrides,
  };
}

function complaintInput(overrides = {}) {
  return {
    reference: `HFX-2026-${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`,
    ownerId: ids.student, hostelId: ids.hostel, categoryId: ids.category,
    title: 'Ceiling fan stopped working', description: 'The ceiling fan no longer starts when its wall switch is turned on.',
    location: { type: 'ROOM', hostelId: ids.hostel, blockId: ids.block, roomId: ids.room },
    indicators: { safetyRisk: false, essentialServiceOutage: false, affectsMultipleRooms: false, functionalityLoss: true },
    priority: 'MEDIUM', suggestedPriority: 'MEDIUM', priorityExplanation: 'Loss of functionality was reported.',
    clientRequestId: randomUUID(), clientRequestHash: createHash('sha256').update(randomUUID()).digest('hex'),
    slaPolicy: policyInput().slaTargets, createdAt: new Date(start), responseDueAt: after(480), resolutionDueAt: after(2880),
    ...overrides,
  };
}

function resolvedComplaintInput(overrides = {}) {
  return complaintInput({
    status: 'RESOLVED', assigneeId: ids.staff, firstRespondedAt: after(15), workStartedAt: after(30),
    resolvedAt: after(60), resolverId: ids.staff,
    resolutionNote: 'Replaced the faulty capacitor and tested every fan speed.', reopenUntil: after(60 + 7 * 24 * 60),
    ...overrides,
  });
}

function reopenedComplaintInput(overrides = {}) {
  const resolved = resolvedComplaintInput();
  const reopenedAt = after(120);
  const prior = {
    cycleNumber: 1, startedAt: new Date(start), assigneeId: resolved.assigneeId, slaPolicy: resolved.slaPolicy,
    responseDueAt: resolved.responseDueAt, resolutionDueAt: resolved.resolutionDueAt,
    firstRespondedAt: resolved.firstRespondedAt, resolvedAt: resolved.resolvedAt,
    resolutionNote: resolved.resolutionNote, resolverId: resolved.resolverId, resolutionDurationMinutes: 60,
    reopenedAt, reopenReason: 'The repaired fan stopped again after a few minutes.',
  };
  return complaintInput({
    status: 'REOPENED', cycleNumber: 2, reopenCount: 1, reopenedAt,
    responseDueAt: after(480, reopenedAt), resolutionDueAt: after(2880, reopenedAt), priorCycles: [prior], ...overrides,
  });
}

const hostelInput = (overrides = {}) => ({ name: 'Test Hostel', code: `H-${objectId().toHexString().slice(-16)}`, enrollmentCodeHash, ...overrides });
const blockInput = (overrides = {}) => ({ hostelId: ids.hostel, name: 'Block Alpha', code: 'ALPHA', ...overrides });
const roomInput = (overrides = {}) => ({ hostelId: ids.hostel, blockId: ids.block, label: 'A-101', ...overrides });
const categoryInput = (overrides = {}) => ({ hostelId: ids.hostel, name: 'Electrical', code: 'ELECTRICAL', ...overrides });
const sessionInput = (overrides = {}) => ({ userId: ids.student, tokenFamily: randomUUID(), tokenHash, expiresAt: new Date(Date.now() + 7 * 86400000), ...overrides });
const activityInput = (overrides = {}) => ({ complaintId: ids.complaint, type: 'CREATED', occurredAt: new Date(start), ...overrides });
const commentInput = (overrides = {}) => ({ complaintId: ids.complaint, authorId: ids.student, authorName: 'Test Resident', authorRole: 'STUDENT', body: 'The problem is still present.', ...overrides });
const attachmentInput = (overrides = {}) => ({ ownerId: ids.student, originalName: 'fan.png', mimeType: 'image/png', width: 200, height: 200, sizeBytes: 1024, storageKey: `${randomUUID()}.png`, ...overrides });
const feedbackInput = (overrides = {}) => ({ complaintId: ids.complaint, authorId: ids.student, rating: 5, cycleNumber: 1, ...overrides });

const inputs = { User: userInput, Session: sessionInput, Hostel: hostelInput, Block: blockInput, Room: roomInput,
  Category: categoryInput, Complaint: complaintInput, Activity: activityInput, Comment: commentInput,
  Attachment: attachmentInput, Feedback: feedbackInput, HostelPolicy: policyInput };

module.exports = { objectId, ids, start, after, passwordHash, enrollmentCodeHash, tokenHash, inputs,
  policyInput, userInput, hostelInput, blockInput, roomInput, categoryInput, sessionInput,
  complaintInput, resolvedComplaintInput, reopenedComplaintInput, activityInput, commentInput, attachmentInput, feedbackInput };
