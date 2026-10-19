const { modelSchema, text, ref } = require('./common');
const { catalogBlock } = require('./projections');

function blockSchema() {
  const schema = modelSchema({
    hostelId: ref('Hostel', { required: true, immutable: true }),
    name: text(2, 80, { required: true }),
    code: text(1, 12, { required: true, uppercase: true, immutable: true, match: /^[A-Z0-9-]+$/ }),
    isActive: { type: Boolean, default: true, required: true },
  }, { serialize: catalogBlock });
  schema.index({ hostelId: 1, code: 1 }, { unique: true });
  schema.index({ hostelId: 1, isActive: 1 });
  return schema;
}

module.exports = { blockSchema };
