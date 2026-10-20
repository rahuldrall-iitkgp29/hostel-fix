import type { ApiClient } from "./client";
import {
  authResponseSchema,
  userResponseSchema,
  type AuthResponse,
  type UserResponse,
} from "@/features/auth/types";
import type { LoginFormData, RegisterFormData } from "@/features/auth/schemas";

export async function loginUser(
  client: ApiClient,
  credentials: LoginFormData
): Promise<AuthResponse> {
  const response = await client.request("/auth/login", authResponseSchema, {
    method: "POST",
    body: {
      email: credentials.email.trim().toLowerCase(),
      password: credentials.password,
    },
  });
  return response.data;
}

export async function registerStudent(
  client: ApiClient,
  data: RegisterFormData
): Promise<UserResponse> {
  const payload: Record<string, unknown> = {
    name: data.name.trim(),
    email: data.email.trim().toLowerCase(),
    password: data.password,
    hostelId: data.hostelId,
    blockId: data.blockId,
    roomId: data.roomId,
    enrollmentCode: data.enrollmentCode.trim(),
  };

  if (data.phone && data.phone.trim().length > 0) {
    payload.phone = data.phone.trim();
  }

  const response = await client.request("/auth/register", userResponseSchema, {
    method: "POST",
    body: payload,
  });
  return response.data;
}

export async function refreshSession(client: ApiClient): Promise<AuthResponse> {
  const response = await client.request("/auth/refresh", authResponseSchema, {
    method: "POST",
    body: {},
  });
  return response.data;
}

export async function logoutUser(client: ApiClient): Promise<void> {
  await client.requestNoContent("/auth/logout", {
    method: "POST",
    body: {},
  });
}
