const mongoose = require('mongoose');
const { createModels } = require('../../src/models');
const project = require('../../src/models/projections');
const { inputs, ids, objectId, start, after, userInput, complaintInput, resolvedComplaintInput,
  reopenedComplaintInput, activityInput, attachmentInput, feedbackInput } = require('../helpers/models.helper');

const connection = mongoose.createConnection();
const models = createModels(connection);
afterAll(() => connection.destroy());

const forbidden = ['passwordHash', 'enrollmentCodeHash', 'tokenHash', 'tokenFamily', 'storageKey', 'clientRequestHash', 'userAgent', 'ipAddress'];

test.each(Object.keys(inputs))('%s serializes with an explicit allowlist and hides secrets in toObject too', async (name) => {
  const doc = new models[name](inputs[name]());
  await doc.validate();
  const json = JSON.stringify(doc);
  for (const field of forbidden) {
    expect(json).not.toContain(field);
    expect(doc.toObject()).not.toHaveProperty(field);
    if (doc[field]) expect(json).not.toContain(String(doc[field]));
  }
  expect(json).not.toContain('__v');
  expect(json).not.toContain('"_id"');
});

test.each(['STUDENT', 'STAFF', 'ADMIN'])('self projection for %s omits unrelated profile fields, including from lean objects', (role) => {
  const input = { _id: ids.student, ...userInput({ role }), createdAt: start, version: 1, status: 'ACTIVE' };
  const output = project.userSelf(input);
  expect(output.id).toBe(ids.student.toHexString());
  expect(output.createdAt).toBe(start.toISOString());
  expect(output.phone).toBeNull();
  expect(output).not.toHaveProperty('passwordHash');
  expect(Object.hasOwn(output, 'adminHostelIds')).toBe(role === 'ADMIN');
  expect(Object.hasOwn(output, 'categoryIds')).toBe(role === 'STAFF');
  expect(Object.hasOwn(output, 'roomId')).toBe(role === 'STUDENT');
});

test('staff picker excludes contact details; email requires the explicit management projection', () => {
  const value = { _id: ids.staff, ...userInput({ role: 'STAFF' }), phone: '+919876543210' };
  expect(project.staffSummary(value)).not.toHaveProperty('email');
  expect(project.staffSummary(value)).not.toHaveProperty('phone');
  expect(project.staffSummary(value, { includeEmail: true, openAssignedCount: 3 })).toMatchObject({ email: value.email, openAssignedCount: 3 });
});

test('public catalog does not expose enrollment hashes, resident data, or private policy fields', () => {
  const hostel = { _id: ids.hostel, ...inputs.Hostel(), occupants: [userInput()], policy: { internal: 'private' } };
  expect(project.catalogHostel(hostel)).toEqual({ id: ids.hostel.toHexString(), name: hostel.name, code: hostel.code });
  expect(project.catalogRoom({ _id: ids.room, ...inputs.Room(), occupants: [userInput()] })).toEqual({
    id: ids.room.toHexString(), hostelId: ids.hostel.toHexString(), blockId: ids.block.toHexString(), label: 'A-101',
  });
});

test('populated complaint references project only safe identity/location labels', () => {
  const input = complaintInput({
    _id: ids.complaint, ownerId: { _id: ids.student, name: 'Current Resident Name', email: 'private@example.test', phone: '+919876543210' },
    assigneeId: { _id: ids.staff, name: 'Technician', email: 'staff-private@example.test', passwordHash: 'private-hash' },
    categoryId: { _id: ids.category, name: 'Electrical', internal: 'private-category-data' },
    location: { type: 'ROOM', hostelId: { _id: ids.hostel, name: 'Hostel A', enrollmentCodeHash: 'private-enrollment' },
      blockId: { _id: ids.block, name: 'Alpha' }, roomId: { _id: ids.room, label: 'A-101', residents: ['private-resident'] } },
  });
  const summary = project.complaintSummary(input, { now: start });
  expect(summary.category).toEqual({ id: ids.category.toHexString(), name: 'Electrical' });
  expect(summary.location).toMatchObject({ hostelName: 'Hostel A', blockName: 'Alpha', roomLabel: 'A-101' });
  expect(summary).not.toHaveProperty('owner');
  const detail = project.complaintDetail(input, { now: start });
  expect(detail.owner).toEqual({ id: ids.student.toHexString(), name: 'Current Resident Name' });
  expect(JSON.stringify(detail)).not.toContain('private');
  expect(detail).not.toHaveProperty('clientRequestHash');
  expect(detail).not.toHaveProperty('clientRequestId');
});

test('nullable summary fields are explicit and overdue flags use strict time boundaries and open states', () => {
  const input = new models.Complaint(complaintInput({ _id: ids.complaint })).toObject({ transform: false });
  const summary = project.complaintSummary(input, { now: input.responseDueAt });
  expect(summary.assignee).toBeNull();
  expect(summary.location.areaLabel).toBeNull();
  expect(summary.isResponseOverdue).toBe(false);
  expect(project.complaintSummary(input, { now: new Date(+input.responseDueAt + 1) }).isResponseOverdue).toBe(true);
  expect(project.complaintSummary({ ...input, firstRespondedAt: after(15) }, { now: after(5000) }).isResponseOverdue).toBe(false);
  for (const status of ['RESOLVED', 'CLOSED', 'REJECTED']) {
    expect(project.complaintSummary({ ...input, status }, { now: after(5000) })).toMatchObject({ isResponseOverdue: false, isResolutionOverdue: false });
  }
});

test('current/prior cycle projections retain SLA evidence without duplicating current storage or a timeline', () => {
  const resolved = project.complaintDetail(new models.Complaint({ _id: ids.complaint, ...resolvedComplaintInput() }));
  expect(resolved.currentCycle).toMatchObject({ startedAt: start.toISOString(), resolutionDurationMinutes: 60 });
  const reopened = project.complaintDetail({ _id: ids.complaint, ...reopenedComplaintInput() });
  expect(reopened.currentCycle).toMatchObject({ cycleNumber: 2, startedAt: after(120).toISOString(), assigneeId: null, resolvedAt: null, resolutionDurationMinutes: null });
  expect(reopened.priorCycles[0]).toMatchObject({ cycleNumber: 1, responseDueAt: after(480).toISOString(), resolutionDueAt: after(2880).toISOString() });
  expect(reopened.priorCycles[0].slaPolicy.MEDIUM).toEqual({ responseMinutes: 480, resolutionMinutes: 2880 });
  expect(reopened).not.toHaveProperty('timeline');
  expect(reopened).not.toHaveProperty('activity');
});

test('detail suppresses invalid/old/other-complaint feedback and inaccessible duplicate relations', () => {
  const input = new models.Complaint({ _id: ids.complaint, ...resolvedComplaintInput(), duplicateOfId: objectId() }).toObject({ transform: false });
  const currentFeedback = { _id: objectId(), ...feedbackInput(), isCurrent: true };
  expect(project.complaintDetail(input, { currentFeedback }).feedback.rating).toBe(5);
  for (const change of [{ isCurrent: false }, { cycleNumber: 2 }, { complaintId: objectId() }]) {
    expect(project.complaintDetail(input, { currentFeedback: { ...currentFeedback, ...change } }).feedback).toBeNull();
  }
  expect(project.complaintDetail({ ...input, status: 'REOPENED' }, { currentFeedback }).feedback).toBeNull();
  expect(project.complaintDetail(input).duplicate).toEqual({ isLinked: true });
  const readableCanonical = { _id: input.duplicateOfId, reference: 'HFX-2026-1234567890', ownerEmail: 'private@example.test' };
  expect(project.complaintDetail(input, { readableCanonical }).duplicate).toEqual({
    isLinked: true, id: input.duplicateOfId.toHexString(), reference: readableCanonical.reference,
  });
});

test('attachments project only metadata and a private content URL, including through detail', () => {
  const file = { _id: objectId(), ...attachmentInput() };
  const unrelated = { _id: objectId(), ...attachmentInput() };
  const projected = project.attachment(file);
  expect(projected.url).toBe(`/api/v1/uploads/${file._id}/content`);
  expect(projected).not.toHaveProperty('storageKey');
  const detail = project.complaintDetail({ _id: ids.complaint, ...complaintInput({ attachmentIds: [file._id] }) }, { attachments: [file, unrelated] });
  expect(detail.attachments).toEqual([projected]);
});

test('activity serialization uses immutable actor snapshots and allowlists even poisoned lean Mixed values', () => {
  const record = { _id: objectId(), ...activityInput({ actorId: ids.student, actorName: 'Name at event time', actorRole: 'STUDENT',
    type: 'FEEDBACK_SUBMITTED', changes: { rating: 4, comment: 'Fixed promptly.', tokenHash: 'private-token', user: { email: 'private-email' } } }) };
  expect(project.activity(record)).toMatchObject({
    actor: { id: ids.student.toHexString(), name: 'Name at event time', role: 'STUDENT' },
    changes: { rating: 4, comment: 'Fixed promptly.' }, note: null, previousStatus: null, newStatus: null,
  });
  expect(JSON.stringify(project.activity(record))).not.toContain('private');
  expect(project.activity({ ...record, changes: { rating: { passwordHash: 'private' } } }).changes).toBeNull();
  expect(project.activity({ ...record, type: 'CONTENT_UPDATED', changes: { location: { passwordHash: 'private' } } }).changes).toBeNull();
  expect(project.activity(activityInput()).actor).toBeNull();
});

test('activity change IDs/dates become safe strings, and comment author snapshots omit contacts', () => {
  const event = project.activity({ ...activityInput({ type: 'ASSIGNED' }), changes: { previousAssigneeId: null, assigneeId: ids.staff } });
  expect(event.changes).toEqual({ previousAssigneeId: null, assigneeId: ids.staff.toHexString() });
  const priority = project.activity({ ...activityInput({ type: 'PRIORITY_CHANGED' }), changes: { responseDueAt: after(120) } });
  expect(priority.changes.responseDueAt).toBe(after(120).toISOString());
  expect(project.comment({ ...inputs.Comment(), authorEmail: 'private@example.test' }).author).toEqual({
    id: ids.student.toHexString(), name: 'Test Resident', role: 'STUDENT',
  });
});
