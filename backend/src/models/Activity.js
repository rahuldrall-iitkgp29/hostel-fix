const { Schema } = require('mongoose');
const { modelSchema, ref, text } = require('./common');
const { ROLES, STATUSES, ACTIVITY_TYPES } = require('./enums');
const { validateChanges } = require('./activityChanges');
const { activity } = require('./projections');

function activitySchema() {
  const schema = modelSchema(
    {
      complaintId: ref('Complaint', { required: true }),
      type: { type: String, enum: ACTIVITY_TYPES, required: true },
      actorId: ref('User', { default: null }),
      actorName: text(2, 80, { default: null }),
      actorRole: { type: String, enum: ROLES, default: null },
      occurredAt: { type: Date, required: true, default: Date.now },
      previousStatus: { type: String, enum: STATUSES, default: null },
      newStatus: { type: String, enum: STATUSES, default: null },
      note: text(1, 2000, { default: null }),
      changes: { type: Schema.Types.Mixed, default: null },
    },
    { appendOnly: true, transactionOnCreate: true, serialize: activity }
  );
  schema.pre('validate', function () {
    if (
      this.actorId
        ? !this.actorName || !this.actorRole
        : this.actorName != null || this.actorRole != null
    ) {
      this.invalidate(
        'actorId',
        'Actor snapshots must match the actor; system actors are null.'
      );
    }
    const parsed = validateChanges(this.type, this.changes);
    if (!parsed.success)
      this.invalidate('changes', 'Unsupported activity change payload.');
    else this.changes = parsed.data;
  });
  schema.index({ complaintId: 1, occurredAt: 1, _id: 1 });
  return schema;
}

module.exports = { activitySchema };
