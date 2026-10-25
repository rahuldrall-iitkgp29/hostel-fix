const { modelSchema, text, ref } = require('./common');
const { category } = require('./projections');

function categorySchema() {
  const schema = modelSchema(
    {
      hostelId: ref('Hostel', { required: true, immutable: true }),
      code: text(2, 30, {
        required: true,
        uppercase: true,
        immutable: true,
        match: /^[A-Z_]+$/,
      }),
      name: text(2, 60, { required: true }),
      description: { type: String, default: null, maxlength: 300 },
      isActive: { type: Boolean, default: true, required: true },
    },
    { serialize: category }
  );
  schema.index({ hostelId: 1, code: 1 }, { unique: true });
  schema.index({ hostelId: 1, isActive: 1 });
  return schema;
}

module.exports = { categorySchema };
