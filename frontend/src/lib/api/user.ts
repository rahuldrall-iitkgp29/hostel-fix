import type { ApiClient } from "./client";
import { userResponseSchema, type UserResponse } from "@/features/auth/types";
import type { ProfileFormData, ChangePasswordFormData } from "@/features/auth/schemas";

export async function getMe(client: ApiClient): Promise<UserResponse> {
  const response = await client.request("/users/me", userResponseSchema, {
    method: "GET",
  });
  return response.data;
}

export async function updateProfile(
  client: ApiClient,
  data: ProfileFormData
): Promise<UserResponse> {
  const payload: Record<string, unknown> = {
    expectedVersion: data.expectedVersion,
  };
  if (data.name !== undefined && data.name.trim().length > 0) {
    payload.name = data.name.trim();
  }
  if (data.phone !== undefined) {
    payload.phone = data.phone ? data.phone.trim() : null;
  }

  const response = await client.request("/users/me", userResponseSchema, {
    method: "PATCH",
    body: payload,
  });
  return response.data;
}

export async function changePassword(
  client: ApiClient,
  data: ChangePasswordFormData
): Promise<void> {
  await client.requestNoContent("/users/me/password", {
    method: "POST",
    body: {
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
    },
  });
}
