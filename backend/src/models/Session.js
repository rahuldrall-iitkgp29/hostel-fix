const { modelSchema, ref, uuid, bcryptHash } = require('./common');

function sessionSchema() {
  const schema = modelSchema({
    userId: ref('User', { required: true, immutable: true }),
    tokenFamily: { ...uuid(true), select: false, immutable: true },
    tokenHash: bcryptHash(12),
    isRevoked: { type: Boolean, default: false, required: true },
    expiresAt: { type: Date, required: true },
    lastRefreshedAt: { type: Date },
    userAgent: {
      type: String,
      default: null,
      maxlength: 256,
      select: false,
      set: (value) => (typeof value === 'string' ? value.slice(0, 256) : value),
    },
    ipAddress: { type: String, default: null, select: false },
  });
  schema.pre('validate', function () {
    if (this.isNew && this.lastRefreshedAt == null) {
      this.createdAt ??= new Date();
      this.lastRefreshedAt = this.createdAt;
    }
  });
  schema.index({ userId: 1 });
  schema.index({ userId: 1, isRevoked: 1 });
  schema.index({ tokenFamily: 1 }, { unique: true });
  schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  return schema;
}

module.exports = { sessionSchema };
