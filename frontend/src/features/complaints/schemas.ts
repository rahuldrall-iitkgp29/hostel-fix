import { z } from "zod";

export const locationTypeEnum = z.enum(["ROOM", "BLOCK_COMMON", "HOSTEL_COMMON"]);
export const priorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const rejectionCodeEnum = z.enum([
  "OUT_OF_SCOPE",
  "INVALID_LOCATION",
  "INSUFFICIENT_INFORMATION",
]);

const idSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ID format");

export const locationSchema = z
  .object({
    type: locationTypeEnum,
    hostelId: idSchema,
    blockId: idSchema.optional().or(z.literal("")),
    roomId: idSchema.optional().or(z.literal("")),
    areaLabel: z.string().trim().min(3, "Area label must be at least 3 characters").max(80).optional().or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    if (val.type === "ROOM") {
      if (!val.blockId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Block is required for room location", path: ["blockId"] });
      }
      if (!val.roomId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Room is required for room location", path: ["roomId"] });
      }
    } else if (val.type === "BLOCK_COMMON") {
      if (!val.blockId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Block is required for block-common location", path: ["blockId"] });
      }
      if (!val.areaLabel || val.areaLabel.trim().length < 3) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Specific area label is required (e.g., 2nd floor bathroom)", path: ["areaLabel"] });
      }
    } else if (val.type === "HOSTEL_COMMON") {
      if (!val.areaLabel || val.areaLabel.trim().length < 3) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Specific area label is required (e.g., dining hall, main lobby)", path: ["areaLabel"] });
      }
    }
  });

export const indicatorsSchema = z.object({
  safetyRisk: z.boolean(),
  essentialServiceOutage: z.boolean(),
  affectsMultipleRooms: z.boolean(),
  functionalityLoss: z.boolean(),
});

export const createComplaintSchema = z.object({
  title: z
    .string()
    .trim()
    .min(8, "Title must be at least 8 characters")
    .max(120, "Title cannot exceed 120 characters"),
  description: z
    .string()
    .trim()
    .min(20, "Please provide at least 20 characters describing the issue")
    .max(4000, "Description cannot exceed 4000 characters"),
  categoryId: idSchema,
  location: locationSchema,
  indicators: indicatorsSchema,
  attachmentIds: z.array(idSchema).max(3, "Maximum 3 photos allowed"),
});

export type CreateComplaintFormData = z.infer<typeof createComplaintSchema>;

export const editComplaintSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    title: z.string().trim().min(8).max(120).optional(),
    description: z.string().trim().min(20).max(4000).optional(),
    categoryId: idSchema.optional(),
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
    "At least one field must be modified"
  );

export type EditComplaintFormData = z.infer<typeof editComplaintSchema>;

export const commentSchema = z.object({
  expectedVersion: z.number().int().min(1),
  body: z
    .string()
    .trim()
    .min(1, "Comment cannot be empty")
    .max(2000, "Comment cannot exceed 2000 characters"),
});

export type CommentFormData = z.infer<typeof commentSchema>;

export const triageSchema = z.object({
  expectedVersion: z.number().int().min(1),
  note: z.string().trim().min(10, "Triage note must be at least 10 characters").max(2000),
});

export const rejectSchema = z.object({
  expectedVersion: z.number().int().min(1),
  rejectionCode: rejectionCodeEnum,
  note: z.string().trim().min(10, "Rejection explanation must be at least 10 characters").max(2000),
});

export const startWorkSchema = z.object({
  expectedVersion: z.number().int().min(1),
  note: z.string().trim().min(10, "Note must be at least 10 characters").max(2000),
});

export const resolveSchema = z.object({
  expectedVersion: z.number().int().min(1),
  resolutionNote: z
    .string()
    .trim()
    .min(20, "Resolution note must be at least 20 characters explaining the repair completed")
    .max(2000),
});

export const closeSchema = z.object({
  expectedVersion: z.number().int().min(1),
  note: z.string().trim().min(5, "Closure note must be at least 5 characters").max(2000),
});

export const assignSchema = z.object({
  expectedVersion: z.number().int().min(1),
  staffId: idSchema,
  note: z.string().trim().min(10, "Assignment note must be at least 10 characters").max(2000),
});

export const overridePrioritySchema = z.object({
  expectedVersion: z.number().int().min(1),
  priority: priorityEnum,
  reason: z.string().trim().min(10, "Override reason must be at least 10 characters").max(2000),
});

export const reopenSchema = z.object({
  expectedVersion: z.number().int().min(1),
  reason: z
    .string()
    .trim()
    .min(20, "Please explain why the repair is incomplete or requires follow-up (min 20 characters)")
    .max(2000),
});

export const feedbackSchema = z.object({
  expectedVersion: z.number().int().min(1),
  rating: z.number().int().min(1, "Please select a rating between 1 and 5").max(5),
  comment: z.string().trim().max(1000).optional().or(z.literal("")),
});
