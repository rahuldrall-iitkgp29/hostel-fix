const { modelSchema, text, ref } = require('./common');
const { catalogRoom } = require('./projections');

function roomSchema() {
  const schema = modelSchema({
    hostelId: ref('Hostel', { required: true, immutable: true }),
    blockId: ref('Block', { required: true, immutable: true }),
    label: text(1, 12, { required: true, uppercase: true, match: /^[A-Z0-9-]+$/ }),
    isActive: { type: Boolean, default: true, required: true },
  }, { serialize: catalogRoom });
  schema.index({ hostelId: 1, blockId: 1, label: 1 }, { unique: true });
  schema.index({ hostelId: 1, blockId: 1, isActive: 1 });
  return schema;
}

module.exports = { roomSchema };
