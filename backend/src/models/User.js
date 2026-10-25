const { z } = require('zod');
const { modelSchema, ref, text, bcryptHash, uniqueItems } = require('./common');
const { ROLES, ACCOUNT_STATUSES } = require('./enums');
const { userSelf } = require('./projections');

function userSchema() {
  const schema = modelSchema(
    {
      name: text(2, 80, { required: true }),
      email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        maxlength: 254,
        validate: (value) => z.email().safeParse(value).success,
      },
      passwordHash: bcryptHash(12),
      phone: { type: String, default: null, match: /^\+[1-9]\d{7,14}$/ },
      role: { type: String, enum: ROLES, required: true, immutable: true },
      status: {
        type: String,
        enum: ACCOUNT_STATUSES,
        default: 'ACTIVE',
        required: true,
      },
      mustChangePassword: { type: Boolean, default: false, required: true },
      hostelId: ref('Hostel', { default: null }),
      blockId: ref('Block', { default: null }),
      roomId: ref('Room', { default: null }),
      adminHostelIds: {
        type: [ref('Hostel')],
        default: [],
        validate: uniqueItems,
      },
      categoryIds: {
        type: [ref('Category')],
        default: [],
        validate: uniqueItems,
      },
      enrollmentCodeHash: { ...bcryptHash(10), required: false, default: null },
    },
    { serialize: userSelf }
  );
  schema.pre('validate', function () {
    if (
      !Array.isArray(this.adminHostelIds) ||
      !Array.isArray(this.categoryIds)
    ) {
      this.invalidate('role', 'Profile lists are required.');
      return;
    }
    const requirements = {
      STUDENT: [
        Boolean(this.hostelId && this.blockId && this.roomId),
        !this.adminHostelIds.length && !this.categoryIds.length,
      ],
      STAFF: [
        Boolean(this.hostelId) && this.blockId == null && this.roomId == null,
        this.categoryIds.length > 0 && !this.adminHostelIds.length,
      ],
      ADMIN: [
        this.hostelId == null && this.blockId == null && this.roomId == null,
        this.adminHostelIds.length > 0 && !this.categoryIds.length,
      ],
    };
    if (requirements[this.role]?.some((condition) => !condition))
      this.invalidate('role', 'Profile fields must match the account role.');
  });
  schema.index({ email: 1 }, { unique: true });
  schema.index({ hostelId: 1, role: 1, status: 1 });
  schema.index({ role: 1, status: 1 });
  return schema;
}

module.exports = { userSchema };
