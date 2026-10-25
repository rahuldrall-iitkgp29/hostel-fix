const ROLES = Object.freeze(['STUDENT', 'STAFF', 'ADMIN']);
const ACCOUNT_STATUSES = Object.freeze(['ACTIVE', 'INACTIVE']);
const STATUSES = Object.freeze([
  'SUBMITTED',
  'TRIAGED',
  'ASSIGNED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'REJECTED',
]);
const OPEN_STATUSES = Object.freeze([
  'SUBMITTED',
  'TRIAGED',
  'ASSIGNED',
  'IN_PROGRESS',
  'REOPENED',
]);
const TERMINAL_STATUSES = Object.freeze(['CLOSED', 'REJECTED']);
const PRIORITIES = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const PRIORITY_SOURCES = Object.freeze(['RULE', 'ADMIN']);
const IMAGE_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
const LOCATION_TYPES = Object.freeze(['ROOM', 'BLOCK_COMMON', 'HOSTEL_COMMON']);
const REJECTION_CODES = Object.freeze([
  'OUT_OF_SCOPE',
  'INVALID_LOCATION',
  'INSUFFICIENT_INFORMATION',
]);
const ACTIVITY_TYPES = Object.freeze([
  'CREATED',
  'CONTENT_UPDATED',
  'TRIAGED',
  'REJECTED',
  'ASSIGNED',
  'REASSIGNED',
  'WORK_STARTED',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'COMMENT_ADDED',
  'PRIORITY_CHANGED',
  'FEEDBACK_SUBMITTED',
  'DUPLICATE_LINKED',
  'DUPLICATE_UNLINKED',
  'ESCALATED',
]);
const INDICATORS = Object.freeze([
  'safetyRisk',
  'essentialServiceOutage',
  'affectsMultipleRooms',
  'functionalityLoss',
]);

module.exports = {
  ROLES,
  ACCOUNT_STATUSES,
  STATUSES,
  OPEN_STATUSES,
  TERMINAL_STATUSES,
  PRIORITIES,
  PRIORITY_SOURCES,
  IMAGE_TYPES,
  LOCATION_TYPES,
  REJECTION_CODES,
  ACTIVITY_TYPES,
  INDICATORS,
};
