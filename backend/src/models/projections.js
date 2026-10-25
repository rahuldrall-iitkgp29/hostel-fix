const { Types } = require('mongoose');
const { OPEN_STATUSES, PRIORITIES, INDICATORS } = require('./enums');
const { projectChanges } = require('./activityChanges');

function id(value) {
  if (value == null) return null;
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (typeof value === 'string')
    return /^[a-f\d]{24}$/i.test(value) ? value.toLowerCase() : null;
  return value._id ? id(value._id) : null;
}
const string = (value) => (typeof value === 'string' ? value : null);
const number = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
function date(value) {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
const person = (value) =>
  value == null ? null : { id: id(value), name: string(value.name) };

function userSelf(value) {
  const result = {
    id: id(value),
    name: string(value.name),
    email: string(value.email),
    phone: string(value.phone),
    role: string(value.role),
    status: string(value.status),
    mustChangePassword: value.mustChangePassword === true,
    version: number(value.version),
    createdAt: date(value.createdAt),
  };
  if (value.role === 'STUDENT')
    Object.assign(result, {
      hostelId: id(value.hostelId),
      blockId: id(value.blockId),
      roomId: id(value.roomId),
    });
  if (value.role === 'STAFF')
    Object.assign(result, {
      hostelId: id(value.hostelId),
      categoryIds: (value.categoryIds ?? []).map(id),
    });
  if (value.role === 'ADMIN')
    result.adminHostelIds = (value.adminHostelIds ?? []).map(id);
  return result;
}

function staffSummary(
  value,
  { includeEmail = false, openAssignedCount = 0 } = {}
) {
  return {
    id: id(value),
    name: string(value.name),
    hostelId: id(value.hostelId),
    categoryIds: (value.categoryIds ?? []).map(id),
    status: string(value.status),
    version: number(value.version),
    openAssignedCount: number(openAssignedCount),
    ...(includeEmail ? { email: string(value.email) } : {}),
  };
}
const catalogHostel = (value) => ({
  id: id(value),
  name: string(value.name),
  code: string(value.code),
});
const catalogBlock = (value) => ({
  id: id(value),
  name: string(value.name),
  code: string(value.code),
});
const catalogRoom = (value) => ({
  id: id(value),
  hostelId: id(value.hostelId),
  blockId: id(value.blockId),
  label: string(value.label),
});
const category = (value) => ({
  id: id(value),
  hostelId: id(value.hostelId),
  code: string(value.code),
  name: string(value.name),
  description: string(value.description),
  isActive: value.isActive === true,
  version: number(value.version),
});

function policySnapshot(value) {
  return Object.fromEntries(
    PRIORITIES.map((priority) => [
      priority,
      {
        responseMinutes: number(value?.[priority]?.responseMinutes),
        resolutionMinutes: number(value?.[priority]?.resolutionMinutes),
      },
    ])
  );
}
function hostelPolicy(value) {
  return {
    policy: {
      slaTargets: policySnapshot(value.slaTargets),
      priorityWeights: Object.fromEntries(
        INDICATORS.map((key) => [key, number(value.priorityWeights?.[key])])
      ),
      priorityThresholds: Object.fromEntries(
        ['CRITICAL', 'HIGH', 'MEDIUM'].map((key) => [
          key,
          number(value.priorityThresholds?.[key]),
        ])
      ),
      escalationConfig: {
        level1FractionOfResolution: number(
          value.escalationConfig?.level1FractionOfResolution
        ),
        level2Minutes: number(value.escalationConfig?.level2Minutes),
        autoEscalate: value.escalationConfig?.autoEscalate === true,
      },
    },
    policyVersion: number(value.policyVersion),
  };
}

function location(value) {
  return {
    type: string(value?.type),
    hostelId: id(value?.hostelId),
    blockId: id(value?.blockId),
    roomId: id(value?.roomId),
    areaLabel: string(value?.areaLabel),
    hostelName: string(value?.hostelId?.name),
    blockName: string(value?.blockId?.name),
    roomLabel: string(value?.roomId?.label),
  };
}
function complaintSummary(value, { now = new Date() } = {}) {
  const open = OPEN_STATUSES.includes(value.status);
  return {
    id: id(value),
    reference: string(value.reference),
    title: string(value.title),
    category: person(value.categoryId),
    location: location(value.location),
    status: string(value.status),
    priority: string(value.priority),
    suggestedPriority: string(value.suggestedPriority),
    prioritySource: string(value.prioritySource),
    assignee: person(value.assigneeId),
    createdAt: date(value.createdAt),
    updatedAt: date(value.updatedAt),
    cycleNumber: number(value.cycleNumber),
    version: number(value.version),
    responseDueAt: date(value.responseDueAt),
    resolutionDueAt: date(value.resolutionDueAt),
    isResponseOverdue:
      open &&
      value.firstRespondedAt == null &&
      value.responseDueAt != null &&
      now > new Date(value.responseDueAt),
    isResolutionOverdue:
      open &&
      value.resolvedAt == null &&
      value.resolutionDueAt != null &&
      now > new Date(value.resolutionDueAt),
  };
}
function cycle(value) {
  return {
    cycleNumber: number(value.cycleNumber),
    startedAt: date(value.startedAt),
    assigneeId: id(value.assigneeId),
    slaPolicy: policySnapshot(value.slaPolicy),
    responseDueAt: date(value.responseDueAt),
    resolutionDueAt: date(value.resolutionDueAt),
    firstRespondedAt: date(value.firstRespondedAt),
    resolvedAt: date(value.resolvedAt),
    resolutionNote: string(value.resolutionNote),
    resolverId: id(value.resolverId),
    resolutionDurationMinutes: number(value.resolutionDurationMinutes),
  };
}
function currentCycle(value) {
  const startedAt =
    value.cycleNumber === 1 ? value.createdAt : value.reopenedAt;
  return cycle({
    cycleNumber: value.cycleNumber,
    startedAt,
    assigneeId: value.assigneeId,
    slaPolicy: value.slaPolicy,
    responseDueAt: value.responseDueAt,
    resolutionDueAt: value.resolutionDueAt,
    firstRespondedAt: value.firstRespondedAt,
    resolvedAt: value.resolvedAt,
    resolutionNote: value.resolutionNote,
    resolverId: value.resolverId,
    resolutionDurationMinutes:
      value.resolvedAt && startedAt
        ? (new Date(value.resolvedAt) - new Date(startedAt)) / 60000
        : null,
  });
}
function complaintDetail(
  value,
  {
    now = new Date(),
    attachments = [],
    currentFeedback = null,
    allowedActions = [],
    readableCanonical = null,
  } = {}
) {
  const validFeedback =
    ['RESOLVED', 'CLOSED'].includes(value.status) &&
    currentFeedback?.isCurrent === true &&
    currentFeedback.cycleNumber === value.cycleNumber &&
    id(currentFeedback.complaintId) === id(value);
  const duplicate = { isLinked: value.duplicateOfId != null };
  if (
    value.duplicateOfId &&
    readableCanonical &&
    id(readableCanonical) === id(value.duplicateOfId)
  ) {
    duplicate.id = id(readableCanonical);
    duplicate.reference = string(readableCanonical.reference);
  }
  return {
    ...complaintSummary(value, { now }),
    description: string(value.description),
    indicators: Object.fromEntries(
      INDICATORS.map((key) => [key, value.indicators?.[key] === true])
    ),
    priorityExplanation: string(value.priorityExplanation),
    owner: person(value.ownerId),
    attachments: attachments
      .filter((file) =>
        (value.attachmentIds ?? []).some(
          (attachmentId) => id(attachmentId) === id(file)
        )
      )
      .map(attachment),
    currentCycle: currentCycle(value),
    priorCycles: (value.priorCycles ?? []).map((prior) => ({
      ...cycle(prior),
      reopenedAt: date(prior.reopenedAt),
      reopenReason: string(prior.reopenReason),
    })),
    resolutionNote: string(value.resolutionNote),
    resolvedAt: date(value.resolvedAt),
    reopenUntil: date(value.reopenUntil),
    reopenCount: number(value.reopenCount),
    feedback: validFeedback ? feedback(currentFeedback) : null,
    duplicate,
    allowedActions: allowedActions.filter(
      (action) => typeof action === 'string'
    ),
  };
}

function activity(value) {
  return {
    id: id(value),
    complaintId: id(value.complaintId),
    type: string(value.type),
    actor: value.actorId
      ? {
          id: id(value.actorId),
          name: string(value.actorName),
          role: string(value.actorRole),
        }
      : null,
    occurredAt: date(value.occurredAt),
    previousStatus: string(value.previousStatus),
    newStatus: string(value.newStatus),
    note: string(value.note),
    changes: projectChanges(value.type, value.changes),
  };
}
function comment(value) {
  return {
    id: id(value),
    complaintId: id(value.complaintId),
    author: {
      id: id(value.authorId),
      name: string(value.authorName),
      role: string(value.authorRole),
    },
    body: string(value.body),
    createdAt: date(value.createdAt),
  };
}
function attachment(value) {
  return {
    id: id(value),
    originalName: string(value.originalName),
    mimeType: string(value.mimeType),
    sizeBytes: number(value.sizeBytes),
    width: number(value.width),
    height: number(value.height),
    url: `/api/v1/uploads/${id(value)}/content`,
  };
}
function feedback(value) {
  return {
    id: id(value),
    complaintId: id(value.complaintId),
    authorId: id(value.authorId),
    rating: number(value.rating),
    comment: string(value.comment),
    cycleNumber: number(value.cycleNumber),
    isCurrent: value.isCurrent === true,
  };
}

module.exports = {
  id,
  date,
  userSelf,
  staffSummary,
  catalogHostel,
  catalogBlock,
  catalogRoom,
  category,
  hostelPolicy,
  policySnapshot,
  complaintSummary,
  complaintDetail,
  currentCycle,
  activity,
  comment,
  attachment,
  feedback,
};
