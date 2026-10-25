const { z } = require('zod');
const {
  id,
  version,
  name,
  email,
  password,
  phone,
  empty,
} = require('./common.validators');

const register = z.strictObject({
  name,
  email,
  password,
  phone: phone.optional(),
  hostelId: id,
  blockId: id,
  roomId: id,
  enrollmentCode: z.string().min(8).max(64),
});
const login = z.strictObject({ email, password });
const profile = z
  .strictObject({
    expectedVersion: version,
    name: name.optional(),
    phone: phone.optional(),
  })
  .refine((value) => value.name !== undefined || value.phone !== undefined);
const changePassword = z.strictObject({
  currentPassword: password,
  newPassword: password,
});

module.exports = { register, login, profile, changePassword, empty };
