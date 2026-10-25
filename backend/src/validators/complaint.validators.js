const { z } = require('zod');
const { id, version } = require('./common.validators');
const { STATUSES, PRIORITIES, LOCATION_TYPES } = require('../models/enums');

const locationSchema = z
  .strictObject({
    type: z.enum(LOCATION_TYPES),
    hostelId: id,
    blockId: id.optional(),
    roomId: id.optional(),
    areaLabel: z.string().trim().min(3).max(80).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'ROOM') {
      if (!val.blockId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'blockId is required for ROOM location',
          path: ['blockId'],
        });
      }
      if (!val.roomId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'roomId is required for ROOM location',
          path: ['roomId'],
        });
      }
      if (val.areaLabel !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'areaLabel is forbidden for ROOM location',
          path: ['areaLabel'],
        });
      }
    } else if (val.type === 'BLOCK_COMMON') {
      if (!val.blockId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'blockId is required for BLOCK_COMMON location',
          path: ['blockId'],
        });
      }
      if (!val.areaLabel) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'areaLabel is required for BLOCK_COMMON location',
          path: ['areaLabel'],
        });
      }
      if (val.roomId !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'roomId is forbidden for BLOCK_COMMON location',
          path: ['roomId'],
        });
      }
    } else if (val.type === 'HOSTEL_COMMON') {
      if (!val.areaLabel) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'areaLabel is required for HOSTEL_COMMON location',
          path: ['areaLabel'],
        });
      }
      if (val.blockId !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'blockId is forbidden for HOSTEL_COMMON location',
          path: ['blockId'],
        });
      }
      if (val.roomId !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'roomId is forbidden for HOSTEL_COMMON location',
          path: ['roomId'],
        });
      }
    }
  });

const indicatorsSchema = z.strictObject({
  safetyRisk: z.boolean(),
  essentialServiceOutage: z.boolean(),
  affectsMultipleRooms: z.boolean(),
  functionalityLoss: z.boolean(),
});

const createComplaint = z.strictObject({
  title: z.string().trim().min(8).max(120),
  description: z.string().trim().min(20).max(4000),
  categoryId: id,
  location: locationSchema,
  indicators: indicatorsSchema,
  attachmentIds: z
    .array(id)
    .max(3)
    .refine((items) => new Set(items).size === items.length, {
      message: 'attachmentIds must contain unique IDs',
    })
    .default([]),
  clientRequestId: z.string().uuid(),
});

const editComplaint = z
  .strictObject({
    expectedVersion: version,
    title: z.string().trim().min(8).max(120).optional(),
    description: z.string().trim().min(20).max(4000).optional(),
    categoryId: id.optional(),
    location: locationSchema.optional(),
    indicators: indicatorsSchema.optional(),
  })
  .refine(
    (val) =>
      val.title !== undefined ||
      val.description !== undefined ||
      val.categoryId !== undefined ||
      val.location !== undefined ||
      val.indicators !== undefined,
    { message: 'At least one editable field must be provided' }
  );

const ALLOWED_SORTS = [
  'createdAt:asc',
  'createdAt:desc',
  'updatedAt:desc',
  'priority:desc',
  'resolutionDueAt:asc',
  'workQueue',
];

const complaintFilters = z
  .strictObject({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.string().optional(),
    categoryId: id.optional(),
    priority: z.enum(PRIORITIES).optional(),
    hostelId: id.optional(),
    blockId: id.optional(),
    roomId: id.optional(),
    assigneeId: id.optional(),
    overdue: z.enum(['response', 'resolution', 'any']).optional(),
    unassigned: z.enum(['true', 'false']).optional(),
    q: z.string().trim().min(2).max(100).optional(),
    createdFrom: z.iso.datetime().optional(),
    createdTo: z.iso.datetime().optional(),
    sort: z.string().default('createdAt:desc'),
  })
  .superRefine((val, ctx) => {
    if (!ALLOWED_SORTS.includes(val.sort)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid sort field: ${val.sort}`,
        path: ['sort'],
      });
    }
    if (val.status) {
      const statuses = val.status.split(',').map((s) => s.trim());
      if (statuses.length > 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Maximum 8 statuses allowed',
          path: ['status'],
        });
      }
      for (const s of statuses) {
        if (!STATUSES.includes(s)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid status: ${s}`,
            path: ['status'],
          });
        }
      }
    }
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
  });

const commentInput = z.strictObject({
  expectedVersion: version,
  body: z.string().trim().min(1).max(2000),
});

const complaintParam = z.strictObject({
  complaintId: id,
});

const paginationQuery = z.strictObject({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = {
  createComplaint,
  editComplaint,
  complaintFilters,
  commentInput,
  complaintParam,
  paginationQuery,
  locationSchema,
  indicatorsSchema,
};
