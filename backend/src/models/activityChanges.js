const { z } = require('zod');
const { Types } = require('mongoose');
const { PRIORITIES, LOCATION_TYPES, INDICATORS } = require('./enums');

const id = z.preprocess(
  (value) => (value instanceof Types.ObjectId ? value.toHexString() : value),
  z.string().regex(/^[a-f\d]{24}$/i)
);
const timestamp = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString() : value),
  z.iso.datetime()
);
const location = z
  .object({
    type: z.enum(LOCATION_TYPES),
    hostelId: id,
    blockId: id.nullable().optional(),
    roomId: id.nullable().optional(),
    areaLabel: z.string().trim().min(3).max(80).nullable().optional(),
  })
  .strict();
const indicators = z
  .object(Object.fromEntries(INDICATORS.map((field) => [field, z.boolean()])))
  .strict();
const priority = z.enum(PRIORITIES);
const deadlineFields = {
  previousPriority: priority,
  newPriority: priority,
  previousResponseDueAt: timestamp,
  responseDueAt: timestamp,
  previousResolutionDueAt: timestamp,
  resolutionDueAt: timestamp,
};
const assignmentFields = {
  previousAssigneeId: id.nullable(),
  assigneeId: id.nullable(),
};
// Every value has a type-specific allowlist. Never serialize Mixed directly.
// New command payload fields must be added here deliberately with validation.
const fieldsByType = {
  CREATED: {},
  CONTENT_UPDATED: {
    ...deadlineFields,
    title: z.string().min(8).max(120),
    description: z.string().min(20).max(4000),
    categoryId: id,
    location,
    indicators,
    suggestedPriority: priority,
  },
  TRIAGED: {},
  REJECTED: {},
  ASSIGNED: assignmentFields,
  REASSIGNED: assignmentFields,
  WORK_STARTED: {},
  RESOLVED: {},
  CLOSED: {},
  REOPENED: {},
  COMMENT_ADDED: {},
  PRIORITY_CHANGED: deadlineFields,
  FEEDBACK_SUBMITTED: {
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(1000).nullable(),
  },
  DUPLICATE_LINKED: {},
  DUPLICATE_UNLINKED: {},
  ESCALATED: {},
};
const schemas = Object.fromEntries(
  Object.entries(fieldsByType).map(([type, fields]) => [
    type,
    z
      .object(
        Object.fromEntries(
          Object.entries(fields).map(([field, schema]) => [
            field,
            schema.optional(),
          ])
        )
      )
      .strict(),
  ])
);

function validateChanges(type, value) {
  if (value == null) return { success: true, data: null };
  return schemas[type]?.safeParse(value) ?? { success: false };
}

function projectChanges(type, value) {
  if (
    value == null ||
    !fieldsByType[type] ||
    typeof value !== 'object' ||
    Array.isArray(value)
  )
    return null;
  const allowed = Object.fromEntries(
    Object.keys(fieldsByType[type])
      .filter((key) => Object.hasOwn(value, key))
      .map((key) => [key, value[key]])
  );
  const result = validateChanges(type, allowed);
  return result.success ? result.data : null;
}

module.exports = { validateChanges, projectChanges };
