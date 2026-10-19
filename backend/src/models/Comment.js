const { modelSchema, ref, text } = require('./common');
const { ROLES } = require('./enums');
const { comment } = require('./projections');

function commentSchema() {
  const schema = modelSchema({
    complaintId: ref('Complaint', { required: true }),
    authorId: ref('User', { required: true }),
    authorName: text(2, 80, { required: true }),
    authorRole: { type: String, enum: ROLES, required: true },
    body: text(1, 2000, { required: true }),
  }, { appendOnly: true, transactionOnCreate: true, serialize: comment });
  schema.index({ complaintId: 1, createdAt: 1 });
  schema.index({ complaintId: 1, createdAt: 1, _id: 1 });
  return schema;
}

module.exports = { commentSchema };
