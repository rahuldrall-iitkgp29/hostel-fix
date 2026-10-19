const { modelSchema, embedded, ref, text, integer, uuid, uniqueItems } = require('./common');
const { STATUSES, PRIORITIES, PRIORITY_SOURCES, REJECTION_CODES } = require('./enums');
const { slaTargetsSchema } = require('./policy');
const { locationSchema, indicatorsSchema } = require('./location');
const { complaintSummary } = require('./projections');

const REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const nullableDate = () => ({ type: Date, default: null });

function priorCycleSchema() {
  const schema = embedded({
    cycleNumber: { ...integer(1, 2), required: true },
    startedAt: { type: Date, required: true },
    assigneeId: ref('User', { required: true }),
    slaPolicy: { type: slaTargetsSchema(), required: true },
    responseDueAt: { type: Date, required: true },
    resolutionDueAt: { type: Date, required: true },
    firstRespondedAt: nullableDate(),
    resolvedAt: { type: Date, required: true },
    resolutionNote: text(20, 2000, { required: true }),
    resolverId: ref('User', { required: true }),
    resolutionDurationMinutes: { type: Number, required: true, min: 0, validate: Number.isFinite },
    reopenedAt: { type: Date, required: true },
    reopenReason: text(20, 2000, { required: true }),
  });
  schema.pre('validate', function () {
    if (this.responseDueAt < this.startedAt || this.resolutionDueAt < this.responseDueAt
      || this.resolvedAt < this.startedAt || this.reopenedAt < this.resolvedAt
      || this.reopenedAt - this.resolvedAt > REOPEN_WINDOW_MS
      || (this.firstRespondedAt && (this.firstRespondedAt < this.startedAt || this.firstRespondedAt > this.resolvedAt))) {
      this.invalidate('startedAt', 'Cycle timestamps are inconsistent.');
    }
    if (this.resolvedAt && this.startedAt
      && this.resolutionDurationMinutes !== (this.resolvedAt - this.startedAt) / 60000) {
      this.invalidate('resolutionDurationMinutes', 'Duration must match the recorded cycle.');
    }
  });
  return schema;
}

function complaintSchema() {
  const schema = modelSchema({
    reference: { type: String, required: true, uppercase: true, immutable: true, match: /^HFX-\d{4}-[A-Z0-9]{10}$/ },
    ownerId: ref('User', { required: true, immutable: true }),
    hostelId: ref('Hostel', { required: true, immutable: true }),
    title: text(8, 120, { required: true }),
    description: text(20, 4000, { required: true }),
    categoryId: ref('Category', { required: true }),
    location: { type: locationSchema(), required: true },
    indicators: { type: indicatorsSchema(), required: true },
    status: { type: String, enum: STATUSES, default: 'SUBMITTED', required: true },
    priority: { type: String, enum: PRIORITIES, required: true },
    suggestedPriority: { type: String, enum: PRIORITIES, required: true },
    prioritySource: { type: String, enum: PRIORITY_SOURCES, default: 'RULE', required: true },
    priorityExplanation: { type: String, required: true },
    assigneeId: ref('User', { default: null }),
    clientRequestId: { ...uuid(), immutable: true },
    clientRequestHash: { type: String, required: true, immutable: true, lowercase: true, match: /^[a-f\d]{64}$/, select: false },
    attachmentIds: { type: [ref('Attachment')], default: [],
      validate: (values) => uniqueItems(values) && values.length <= 3 },
    cycleNumber: { ...integer(1, 3), default: 1, required: true },
    reopenCount: { ...integer(0, 2), default: 0, required: true },
    slaPolicy: { type: slaTargetsSchema(), required: true },
    responseDueAt: { type: Date, required: true },
    resolutionDueAt: { type: Date, required: true },
    firstRespondedAt: nullableDate(), resolvedAt: nullableDate(), closedAt: nullableDate(),
    rejectedAt: nullableDate(), reopenedAt: nullableDate(), reopenUntil: nullableDate(),
    resolutionNote: text(20, 2000, { default: null }),
    resolverId: ref('User', { default: null }),
    workStartedAt: nullableDate(),
    priorCycles: { type: [priorCycleSchema()], default: [], validate: (values) => Array.isArray(values) && values.length <= 2 },
    rejectionCode: { type: String, enum: REJECTION_CODES, default: null },
    // Storage reserved by §10.7; duplicate/escalation commands remain P1.
    duplicateOfId: ref('Complaint', { default: null }),
    escalationLevel: { ...integer(0, 2), default: 0, required: true },
  }, { transactionOnCreate: true, serialize: complaintSummary });

  schema.pre('validate', function () {
    if (this.isNew) this.createdAt ??= new Date();
    if (this.location && String(this.location.hostelId) !== String(this.hostelId)) {
      this.invalidate('location.hostelId', 'Location must belong to the complaint hostel.');
    }
    if (this.prioritySource === 'RULE' && this.priority !== this.suggestedPriority) {
      this.invalidate('priority', 'Rule priority must match the suggestion.');
    }
    if (this.cycleNumber !== this.reopenCount + 1 || !Array.isArray(this.priorCycles)
      || this.priorCycles.length !== this.reopenCount
      || this.priorCycles.some((cycle, index) => cycle.cycleNumber !== index + 1)) {
      this.invalidate('priorCycles', 'Cycle history must match the reopen count.');
    }
    if (this.cycleNumber === 1 ? this.reopenedAt != null : this.reopenedAt == null) {
      this.invalidate('reopenedAt', 'Reopened cycles require their start timestamp.');
    }
    const start = this.cycleNumber === 1 ? this.createdAt : this.reopenedAt;
    if (Array.isArray(this.priorCycles)) {
      for (let index = 0; index < this.priorCycles.length; index += 1) {
        const prior = this.priorCycles[index];
        const priorStart = index === 0 ? this.createdAt : this.priorCycles[index - 1].reopenedAt;
        if (+prior.startedAt !== +priorStart) this.invalidate('priorCycles', 'Cycle start times must join the retained history.');
      }
      const latest = this.priorCycles.at(-1);
      if (latest && +latest.reopenedAt !== +this.reopenedAt) this.invalidate('reopenedAt', 'Current cycle must start at the recorded reopen.');
    }
    if (this.responseDueAt < start || this.resolutionDueAt < this.responseDueAt) {
      this.invalidate('responseDueAt', 'Deadlines must be ordered after cycle start.');
    }
    if (this.firstRespondedAt && (this.firstRespondedAt < start || (this.resolvedAt && this.firstRespondedAt > this.resolvedAt))) {
      this.invalidate('firstRespondedAt', 'Response time must belong to the current cycle.');
    }
    if (['ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(this.status) && !this.assigneeId) {
      this.invalidate('assigneeId', 'This state requires one assignee.');
    }
    if (['SUBMITTED', 'TRIAGED', 'REOPENED', 'REJECTED'].includes(this.status) && this.assigneeId != null) {
      this.invalidate('assigneeId', 'This state cannot have an assignee.');
    }
    const resolved = ['RESOLVED', 'CLOSED'].includes(this.status);
    if (resolved && (!this.resolvedAt || !this.resolverId || !this.resolutionNote || !this.reopenUntil
      || this.resolvedAt < start || this.reopenUntil - this.resolvedAt !== REOPEN_WINDOW_MS)) {
      this.invalidate('resolvedAt', 'Resolution fields and the seven-day window are required.');
    }
    if (!resolved && [this.resolvedAt, this.resolverId, this.resolutionNote, this.reopenUntil].some((value) => value != null)) {
      this.invalidate('resolvedAt', 'Unresolved cycles cannot retain a resolution.');
    }
    if (this.status === 'CLOSED' ? !this.closedAt || this.closedAt < this.resolvedAt : this.closedAt != null) {
      this.invalidate('closedAt', 'Closure timestamp must match the complaint state.');
    }
    if (this.status === 'REJECTED' ? !this.rejectedAt || !this.rejectionCode : this.rejectedAt != null || this.rejectionCode != null) {
      this.invalidate('rejectionCode', 'Rejection fields must match the complaint state.');
    }
    if (this.status === 'IN_PROGRESS' && !this.workStartedAt) this.invalidate('workStartedAt', 'Work start is required.');
  });

  function rememberCycle(doc) {
    doc.$locals.cycle = {
      number: doc.cycleNumber, history: doc.priorCycles.map((cycle) => JSON.stringify(cycle)),
      policy: JSON.stringify(doc.slaPolicy), responseDueAt: doc.responseDueAt?.getTime(),
      resolutionDueAt: doc.resolutionDueAt?.getTime(), attachments: doc.attachmentIds.map(String),
      firstRespondedAt: doc.firstRespondedAt?.getTime(),
    };
  }
  schema.post('init', rememberCycle);
  schema.post('save', rememberCycle);
  schema.pre('save', function () {
    const previous = this.$locals.cycle;
    if (!previous) return;
    // Mongoose's immutable array setter also runs during hydration. Compare the
    // persisted IDs explicitly so normal saves work and push/splice cannot bypass it.
    if (this.attachmentIds.length !== previous.attachments.length
      || previous.attachments.some((value, index) => String(this.attachmentIds[index]) !== value)) {
      throw new Error('Complaint attachments cannot be changed after creation.');
    }
    if (this.priorCycles.length < previous.history.length
      || previous.history.some((cycle, index) => JSON.stringify(this.priorCycles[index]) !== cycle)) {
      throw new Error('Prior cycle history cannot be changed.');
    }
    if (this.cycleNumber === previous.number && (JSON.stringify(this.slaPolicy) !== previous.policy
      || this.responseDueAt.getTime() > previous.responseDueAt || this.resolutionDueAt.getTime() > previous.resolutionDueAt)) {
      throw new Error('An existing cycle cannot change policy or extend deadlines.');
    }
    if (this.cycleNumber === previous.number && previous.firstRespondedAt != null
      && this.firstRespondedAt?.getTime() !== previous.firstRespondedAt) {
      throw new Error('First response time is set only once per cycle.');
    }
  });

  schema.index({ reference: 1 }, { unique: true });
  schema.index({ ownerId: 1, status: 1, createdAt: -1 });
  schema.index({ hostelId: 1, status: 1, createdAt: -1 });
  schema.index({ assigneeId: 1, status: 1 }, { sparse: true });
  schema.index({ ownerId: 1, clientRequestId: 1 }, { unique: true });
  schema.index({ hostelId: 1, responseDueAt: 1 });
  schema.index({ hostelId: 1, resolutionDueAt: 1 });
  schema.index({ hostelId: 1, categoryId: 1, status: 1 });
  return schema;
}

module.exports = { complaintSchema, REOPEN_WINDOW_MS };
