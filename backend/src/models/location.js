const { embedded, ref, text } = require('./common');
const { LOCATION_TYPES, INDICATORS } = require('./enums');

function locationSchema() {
  const schema = embedded({
    type: { type: String, enum: LOCATION_TYPES, required: true },
    hostelId: ref('Hostel', { required: true }),
    blockId: ref('Block', { default: null }),
    roomId: ref('Room', { default: null }),
    areaLabel: text(3, 80, { default: null }),
  });
  schema.pre('validate', function () {
    const valid = {
      ROOM:
        this.blockId != null && this.roomId != null && this.areaLabel == null,
      BLOCK_COMMON:
        this.blockId != null && this.roomId == null && this.areaLabel != null,
      HOSTEL_COMMON:
        this.blockId == null && this.roomId == null && this.areaLabel != null,
    };
    if (!valid[this.type])
      this.invalidate('type', 'Location fields must match its type.');
  });
  return schema;
}

function indicatorsSchema() {
  return embedded(
    Object.fromEntries(
      INDICATORS.map((field) => [
        field,
        {
          type: Boolean,
          required: true,
          cast: (value) => {
            if (typeof value !== 'boolean')
              throw new Error('An indicator must be a boolean.');
            return value;
          },
        },
      ])
    )
  );
}

module.exports = { locationSchema, indicatorsSchema };
