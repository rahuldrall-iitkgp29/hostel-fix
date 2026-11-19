import { z } from 'zod';
import { priorityEnum } from './schemas';

const complaintStatusEnum = z.enum([
  'SUBMITTED',
  'TRIAGED',
  'ASSIGNED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'REJECTED',
]);
const id = z.string().regex(/^[a-f\d]{24}$/i);
const count = z.number().int().nonnegative();
const version = z.number().int().positive();
const date = z.iso.datetime();
const person = z.object({ id, name: z.string().nullable() });
const actor = person.extend({
  role: z.enum(['STUDENT', 'STAFF', 'ADMIN']).nullable(),
});
export const attachmentSchema = z.object({
  id,
  originalName: z.string().min(1),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  sizeBytes: version.max(5 * 1024 * 1024),
  width: version.max(6000),
  height: version.max(6000),
  url: z.string().regex(/^\/api\/v1\/uploads\/[a-f\d]{24}\/content$/i),
});
export const complaintSummarySchema = z.object({
  id,
  reference: z.string().min(1),
  title: z.string().min(1),
  category: person.nullable(),
  location: z.object({
    type: z.enum(['ROOM', 'BLOCK_COMMON', 'HOSTEL_COMMON']),
    hostelId: id,
    blockId: id.nullable(),
    roomId: id.nullable(),
    areaLabel: z.string().nullable(),
    hostelName: z.string().nullable(),
    blockName: z.string().nullable(),
    roomLabel: z.string().nullable(),
  }),
  status: complaintStatusEnum,
  priority: priorityEnum,
  suggestedPriority: priorityEnum.nullable(),
  prioritySource: z.string().nullable(),
  assignee: person.nullable(),
  createdAt: date,
  updatedAt: date,
  cycleNumber: version,
  version,
  responseDueAt: date.nullable(),
  resolutionDueAt: date.nullable(),
  isResponseOverdue: z.boolean(),
  isResolutionOverdue: z.boolean(),
});
const cycleSchema = z.object({
  cycleNumber: version,
  startedAt: date.nullable(),
  assigneeId: id.nullable(),
  responseDueAt: date.nullable(),
  resolutionDueAt: date.nullable(),
  firstRespondedAt: date.nullable(),
  resolvedAt: date.nullable(),
  resolutionNote: z.string().nullable(),
  resolverId: id.nullable(),
  resolutionDurationMinutes: z.number().nonnegative().nullable(),
});
export const feedbackSchema = z.object({
  id,
  complaintId: id,
  authorId: id,
  rating: version.max(5),
  comment: z.string().nullable(),
  cycleNumber: version,
  isCurrent: z.boolean(),
});
export const complaintDetailSchema = complaintSummarySchema.extend({
  description: z.string(),
  indicators: z.object({
    safetyRisk: z.boolean(),
    essentialServiceOutage: z.boolean(),
    affectsMultipleRooms: z.boolean(),
    functionalityLoss: z.boolean(),
  }),
  priorityExplanation: z.string().nullable(),
  owner: person.nullable(),
  attachments: z.array(attachmentSchema).max(3),
  currentCycle: cycleSchema,
  priorCycles: z.array(
    cycleSchema.extend({
      reopenedAt: date.nullable(),
      reopenReason: z.string().nullable(),
    })
  ),
  resolutionNote: z.string().nullable(),
  resolvedAt: date.nullable(),
  reopenUntil: date.nullable(),
  reopenCount: count,
  feedback: feedbackSchema.nullable(),
  allowedActions: z.array(
    z.enum([
      'EDIT',
      'COMMENT',
      'CLOSE',
      'REOPEN',
      'FEEDBACK',
      'TRIAGE',
      'REJECT',
      'CHANGE_PRIORITY',
      'ASSIGN',
      'REASSIGN',
      'START_WORK',
      'RESOLVE',
    ])
  ),
});
export const commentSchema = z.object({
  id,
  complaintId: id,
  author: actor,
  body: z.string(),
  createdAt: date,
});
export const activitySchema = z.object({
  id,
  complaintId: id,
  type: z.string().min(1),
  actor: actor.nullable(),
  occurredAt: date,
  previousStatus: complaintStatusEnum.nullable(),
  newStatus: complaintStatusEnum.nullable(),
  note: z.string().nullable(),
  changes: z
    .record(
      z.string(),
      z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.null(),
        z.array(z.string()),
        z.record(
          z.string(),
          z.union([z.string(), z.number(), z.boolean(), z.null()])
        ),
      ])
    )
    .nullable(),
});
export const categorySchema = z.object({
  id,
  hostelId: id,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  version,
});
export const staffSchema = z.object({
  id,
  name: z.string(),
  hostelId: id,
  categoryIds: z.array(id.nullable()),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  version,
  openAssignedCount: count,
  email: z.string().email().optional(),
});
const statusCounts = z.object({
  SUBMITTED: count,
  TRIAGED: count,
  ASSIGNED: count,
  IN_PROGRESS: count,
  RESOLVED: count,
  CLOSED: count,
  REOPENED: count,
  REJECTED: count,
});
const overview = {
  asOf: date,
  statusCounts,
  total: count,
  open: count,
  resolved: count,
  closed: count,
  rejected: count,
  recentComplaints: z.array(complaintSummarySchema),
};
export const studentDashboardSchema = z.object({
  ...overview,
  latestActivity: z.array(activitySchema),
});
export const staffDashboardSchema = z.object({
  asOf: date,
  statusCounts,
  total: count,
  assignedPending: count,
  inProgress: count,
  overdueResponse: count,
  overdueResolution: count,
  overdueAny: count,
  queue: z.array(complaintSummarySchema),
  resolutionHistory: z.array(complaintSummarySchema).optional(),
  latestActivity: z.array(activitySchema).optional(),
});
export const adminDashboardSchema = z.object({
  ...overview,
  unassigned: count,
  overdueResponse: count,
  overdueResolution: count,
  overdueAny: count,
  priorityCounts: z
    .object({ LOW: count, MEDIUM: count, HIGH: count, CRITICAL: count })
    .optional(),
  hostelBreakdown: z
    .array(
      z.object({
        hostelId: id,
        name: z.string(),
        total: count,
        open: count,
        assigned: count,
        inProgress: count,
        resolved: count,
        closed: count,
        unassigned: count,
      })
    )
    .optional(),
  recentActivity: z.array(activitySchema).optional(),
  staffWorkload: z.array(
    z.object({
      staffId: id,
      name: z.string(),
      assignedPending: count,
      inProgress: count,
      openAssigned: count,
    })
  ),
});
