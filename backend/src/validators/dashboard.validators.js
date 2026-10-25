const { z } = require('zod');
const { id } = require('./common.validators');
const { PRIORITIES } = require('../models/enums');

function validateDateRange(val, ctx) {
  if (val.createdFrom && val.createdTo) {
    const from = new Date(val.createdFrom);
    const to = new Date(val.createdTo);
    if (to < from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'createdTo must be on or after createdFrom',
        path: ['createdTo'],
      });
    } else if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Date range cannot exceed 366 days',
        path: ['createdTo'],
      });
    }
  }
}

const studentDashboardQuery = z
  .strictObject({
    categoryId: id.optional(),
    priority: z.enum(PRIORITIES).optional(),
    createdFrom: z.iso.datetime().optional(),
    createdTo: z.iso.datetime().optional(),
  })
  .superRefine(validateDateRange);

const staffDashboardQuery = z
  .strictObject({
    categoryId: id.optional(),
    priority: z.enum(PRIORITIES).optional(),
    createdFrom: z.iso.datetime().optional(),
    createdTo: z.iso.datetime().optional(),
  })
  .superRefine(validateDateRange);

const adminDashboardQuery = z
  .strictObject({
    hostelId: id.optional(),
    categoryId: id.optional(),
    priority: z.enum(PRIORITIES).optional(),
    createdFrom: z.iso.datetime().optional(),
    createdTo: z.iso.datetime().optional(),
  })
  .superRefine(validateDateRange);

module.exports = {
  studentDashboardQuery,
  staffDashboardQuery,
  adminDashboardQuery,
};
