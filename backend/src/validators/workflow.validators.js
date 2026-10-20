const { z } = require('zod');
const { id, version } = require('./common.validators');
const { PRIORITIES, REJECTION_CODES } = require('../models/enums');

const triagedTransition = z.strictObject({
  expectedVersion: version,
  toStatus: z.literal('TRIAGED'),
  note: z.string().trim().min(10).max(2000),
});

const rejectedTransition = z.strictObject({
  expectedVersion: version,
  toStatus: z.literal('REJECTED'),
  note: z.string().trim().min(10).max(2000),
  rejectionCode: z.enum(REJECTION_CODES),
});

const inProgressTransition = z.strictObject({
  expectedVersion: version,
  toStatus: z.literal('IN_PROGRESS'),
  note: z.string().trim().min(10).max(2000),
});

const resolvedTransition = z.strictObject({
  expectedVersion: version,
  toStatus: z.literal('RESOLVED'),
  resolutionNote: z.string().trim().min(20).max(2000),
});

const closedTransition = z.strictObject({
  expectedVersion: version,
  toStatus: z.literal('CLOSED'),
  note: z.string().trim().min(5).max(2000),
});

const transitionInput = z.discriminatedUnion('toStatus', [
  triagedTransition,
  rejectedTransition,
  inProgressTransition,
  resolvedTransition,
  closedTransition,
]);

const assignmentInput = z.strictObject({
  expectedVersion: version,
  staffId: id,
  note: z.string().trim().min(10).max(2000),
});

const priorityOverrideInput = z.strictObject({
  expectedVersion: version,
  priority: z.enum(PRIORITIES),
  reason: z.string().trim().min(10).max(2000),
});

const reopenInput = z.strictObject({
  expectedVersion: version,
  reason: z.string().trim().min(20).max(2000),
});

const feedbackInput = z.strictObject({
  expectedVersion: version,
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

module.exports = {
  transitionInput,
  assignmentInput,
  priorityOverrideInput,
  reopenInput,
  feedbackInput,
};
