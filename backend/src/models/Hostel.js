const { modelSchema, text, bcryptHash } = require('./common');
const { catalogHostel } = require('./projections');

function hostelSchema() {
  const schema = modelSchema(
    {
      name: text(2, 80, { required: true }),
      code: text(2, 20, {
        required: true,
        uppercase: true,
        immutable: true,
        match: /^[A-Z0-9-]+$/,
      }),
      enrollmentCodeHash: bcryptHash(10),
      isActive: { type: Boolean, default: true, required: true },
    },
    { serialize: catalogHostel }
  );
  schema.index({ code: 1 }, { unique: true });
  schema.index({ isActive: 1 });
  return schema;
}

module.exports = { hostelSchema };
