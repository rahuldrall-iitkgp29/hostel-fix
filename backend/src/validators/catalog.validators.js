const { z } = require('zod');
const { id } = require('./common.validators');

const pagination = {
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

const hostelListQuery = z.strictObject({
  ...pagination,
});

const hostelBlocksParams = z.strictObject({
  hostelId: id,
});

const roomsQuery = z.strictObject({
  hostelId: id,
  blockId: id,
  ...pagination,
});

const categoriesQuery = z.strictObject({
  hostelId: id,
  includeInactive: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false || val === undefined) return false;
    return val;
  }, z.boolean()),
  ...pagination,
});

const adminStaffQuery = z.strictObject({
  hostelId: id,
  categoryId: id.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  eligibleForComplaintId: id.optional(),
  ...pagination,
});

module.exports = {
  pagination,
  hostelListQuery,
  hostelBlocksParams,
  roomsQuery,
  categoriesQuery,
  adminStaffQuery,
};
