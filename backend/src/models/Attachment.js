const { modelSchema, ref, text, integer } = require('./common');
const { IMAGE_TYPES } = require('./enums');
const { attachment } = require('./projections');
const { POLICY } = require('../config/policy');

const STAGED_LIFETIME_MS = 60 * 60 * 1000;

function attachmentSchema() {
  const schema = modelSchema(
    {
      ownerId: ref('User', { required: true, immutable: true }),
      complaintId: ref('Complaint', { default: null }),
      originalName: text(1, 255, {
        required: true,
        immutable: true,
        // Store only an already sanitized display filename, never a path/header.
        validate: (value) =>
          !/[\x00-\x1f\x7f/\\<>:"|?*]/.test(value) && !/^\.+$/.test(value),
      }),
      mimeType: {
        type: String,
        enum: IMAGE_TYPES,
        required: true,
        immutable: true,
      },
      sizeBytes: {
        ...integer(1, POLICY.upload.bytes),
        required: true,
        immutable: true,
      },
      width: {
        ...integer(1, POLICY.upload.dimension),
        required: true,
        immutable: true,
      },
      height: {
        ...integer(1, POLICY.upload.dimension),
        required: true,
        immutable: true,
      },
      storageKey: {
        type: String,
        required: true,
        select: false,
        immutable: true,
        match:
          /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}(?:\.(?:jpg|jpeg|png|webp))?$/i,
      },
      expiresAt: {
        type: Date,
        default: function () {
          return this.complaintId
            ? null
            : new Date(Date.now() + STAGED_LIFETIME_MS);
        },
      },
    },
    { allowDelete: true, serialize: attachment }
  );
  schema.pre('validate', function () {
    if (this.width * this.height > POLICY.upload.pixels)
      this.invalidate('width', 'Decoded image exceeds the pixel limit.');
    if (this.complaintId ? this.expiresAt != null : this.expiresAt == null) {
      this.invalidate('expiresAt', 'Only staged uploads have an expiry.');
    }
    const bound = this.$locals.boundComplaintId;
    if (bound && String(this.complaintId) !== bound)
      this.invalidate(
        'complaintId',
        'A bound attachment cannot be unbound or reused.'
      );
  });
  const rememberBinding = (doc) => {
    doc.$locals.boundComplaintId = doc.complaintId
      ? String(doc.complaintId)
      : null;
  };
  schema.post('init', rememberBinding);
  schema.post('save', rememberBinding);
  for (const operation of ['deleteOne', 'findOneAndDelete']) {
    schema.pre(operation, { query: true, document: true }, async function () {
      const doc = this.getFilter
        ? await this.model
            .findOne(this.getFilter())
            .select('complaintId')
            .session(this.getOptions().session)
        : this;
      if (doc?.complaintId)
        throw new Error('Bound attachments cannot be deleted.');
    });
  }
  schema.index({ ownerId: 1, complaintId: 1 });
  // The partial filter also protects bound records if legacy data retained a date.
  schema.index(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, partialFilterExpression: { complaintId: null } }
  );
  schema.index({ complaintId: 1 });
  return schema;
}

module.exports = { attachmentSchema, STAGED_LIFETIME_MS };
