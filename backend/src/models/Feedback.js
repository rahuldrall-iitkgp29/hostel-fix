const { modelSchema, ref, integer, text } = require('./common');
const { feedback } = require('./projections');

function feedbackSchema() {
  const schema = modelSchema(
    {
      complaintId: ref('Complaint', { required: true, immutable: true }),
      authorId: ref('User', { required: true, immutable: true }),
      rating: { ...integer(1, 5), required: true },
      comment: text(0, 1000, { default: null }),
      cycleNumber: { ...integer(1, 3), required: true },
      isCurrent: { type: Boolean, default: true, required: true },
    },
    { transactionOnCreate: true, serialize: feedback }
  );
  // §7.3 uses one replaceable document per complaint, with old values in Activity.
  schema.index({ complaintId: 1 }, { unique: true });
  schema.index({ complaintId: 1, isCurrent: 1 });
  schema.index({ complaintId: 1, cycleNumber: 1 }, { unique: true });
  return schema;
}

module.exports = { feedbackSchema };
