import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Email must not exceed 254 characters")
    .pipe(z.email({ message: "Please enter a valid email address." })),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(128, "Password must not exceed 128 characters"),
});

export type LoginFormData = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name must not exceed 80 characters"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Email must not exceed 254 characters")
    .pipe(z.email({ message: "Please enter a valid email address." })),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(128, "Password must not exceed 128 characters")
    .refine(
      (val) => new TextEncoder().encode(val).length <= 256,
      "Password must not exceed 256 bytes in UTF-8"
    ),
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, "Phone must be in E.164 format (e.g. +919876543210)")
    .optional()
    .or(z.literal("")),
  hostelId: z
    .string()
    .min(1, "Please select a hostel")
    .regex(/^[a-f\d]{24}$/i, "Invalid hostel selected"),
  blockId: z
    .string()
    .min(1, "Please select a block")
    .regex(/^[a-f\d]{24}$/i, "Invalid block selected"),
  roomId: z
    .string()
    .min(1, "Please select a room")
    .regex(/^[a-f\d]{24}$/i, "Invalid room selected"),
  enrollmentCode: z
    .string()
    .trim()
    .min(8, "Enrollment code must be at least 8 characters")
    .max(64, "Enrollment code must not exceed 64 characters"),
});

export type RegisterFormData = z.infer<typeof registerSchema>;

export const profileSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(80, "Name must not exceed 80 characters")
      .optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{7,14}$/, "Phone must be in E.164 format (e.g. +919876543210)")
      .nullable()
      .optional()
      .or(z.literal("")),
  })
  .refine(
    (data) => data.name !== undefined || data.phone !== undefined,
    "Provide at least a name or phone number to update."
  );

export type ProfileFormData = z.infer<typeof profileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(12, "Current password must be at least 12 characters")
      .max(128),
    newPassword: z
      .string()
      .min(12, "New password must be at least 12 characters")
      .max(128)
      .refine(
        (val) => new TextEncoder().encode(val).length <= 256,
        "Password must not exceed 256 bytes in UTF-8"
      ),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords do not match.",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from current password.",
    path: ["newPassword"],
  });

export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;
