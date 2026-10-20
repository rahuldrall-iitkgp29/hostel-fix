import { z } from "zod";

export const roleEnum = z.enum(["STUDENT", "STAFF", "ADMIN"]);
export type UserRole = z.infer<typeof roleEnum>;

export const userSelfSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  role: roleEnum,
  status: z.string(),
  mustChangePassword: z.boolean(),
  version: z.number(),
  createdAt: z.string().nullable().optional(),
  hostelId: z.string().nullable().optional(),
  blockId: z.string().nullable().optional(),
  roomId: z.string().nullable().optional(),
  categoryIds: z.array(z.string().nullable()).optional(),
  adminHostelIds: z.array(z.string().nullable()).optional(),
});

export type UserSelf = z.infer<typeof userSelfSchema>;

export const authResponseSchema = z.object({
  user: userSelfSchema,
  accessToken: z.string(),
  expiresIn: z.number(),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

export const userResponseSchema = z.object({
  user: userSelfSchema,
});

export type UserResponse = z.infer<typeof userResponseSchema>;
