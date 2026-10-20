import { describe, expect, it, vi } from "vitest";
import {
  loginSchema,
  registerSchema,
  profileSchema,
  changePasswordSchema,
} from "../src/features/auth/schemas";
import { getSafeReturnTo } from "../src/features/auth/utils/return-to";
import { createApiClient } from "../src/lib/api/client";
import { loginUser, registerStudent, refreshSession, logoutUser } from "../src/lib/api/auth";
import { changePassword, getMe } from "../src/lib/api/user";

const baseUrl = "http://localhost:5000/api/v1";
const requestId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

const mockUser = {
  id: "67140e4cf8d7455d3e0906e5",
  name: "Alex Sharma",
  email: "alex@hostel.edu",
  phone: "+919876543210",
  role: "STUDENT" as const,
  status: "ACTIVE",
  mustChangePassword: false,
  version: 1,
  createdAt: "2026-10-19T10:00:00.000Z",
  hostelId: "67140e4cf8d7455d3e0906e1",
  blockId: "67140e4cf8d7455d3e0906e2",
  roomId: "67140e4cf8d7455d3e0906e3",
};

describe("Auth Validation Schemas", () => {
  it("validates login credentials correctly", () => {
    const valid = loginSchema.safeParse({
      email: "student@hostel.edu",
      password: "password123456",
    });
    expect(valid.success).toBe(true);

    const invalidEmail = loginSchema.safeParse({
      email: "not-an-email",
      password: "password123456",
    });
    expect(invalidEmail.success).toBe(false);

    const shortPassword = loginSchema.safeParse({
      email: "student@hostel.edu",
      password: "short",
    });
    expect(shortPassword.success).toBe(false);
  });

  it("validates student registration according to PRD contracts", () => {
    const valid = registerSchema.safeParse({
      name: "Alex Sharma",
      email: "alex@hostel.edu",
      password: "securepassword123",
      phone: "+919876543210",
      hostelId: "67140e4cf8d7455d3e0906e1",
      blockId: "67140e4cf8d7455d3e0906e2",
      roomId: "67140e4cf8d7455d3e0906e3",
      enrollmentCode: "CODE123456",
    });
    expect(valid.success).toBe(true);

    // Short enrollment code
    const invalidCode = registerSchema.safeParse({
      name: "Alex Sharma",
      email: "alex@hostel.edu",
      password: "securepassword123",
      hostelId: "67140e4cf8d7455d3e0906e1",
      blockId: "67140e4cf8d7455d3e0906e2",
      roomId: "67140e4cf8d7455d3e0906e3",
      enrollmentCode: "short",
    });
    expect(invalidCode.success).toBe(false);
  });

  it("validates profile update constraints and versioning", () => {
    const valid = profileSchema.safeParse({
      expectedVersion: 1,
      name: "Alex Updated",
      phone: "+919876543219",
    });
    expect(valid.success).toBe(true);

    // Empty update without name or phone
    const emptyUpdate = profileSchema.safeParse({
      expectedVersion: 1,
    });
    expect(emptyUpdate.success).toBe(false);
  });

  it("validates password change requirements", () => {
    const valid = changePasswordSchema.safeParse({
      currentPassword: "oldpassword1234",
      newPassword: "newpassword1234",
      confirmPassword: "newpassword1234",
    });
    expect(valid.success).toBe(true);

    // Mismatched confirmation
    const mismatch = changePasswordSchema.safeParse({
      currentPassword: "oldpassword1234",
      newPassword: "newpassword1234",
      confirmPassword: "differentpassword",
    });
    expect(mismatch.success).toBe(false);

    // New password same as current
    const same = changePasswordSchema.safeParse({
      currentPassword: "samepassword1234",
      newPassword: "samepassword1234",
      confirmPassword: "samepassword1234",
    });
    expect(same.success).toBe(false);
  });
});

describe("Safe returnTo Handling", () => {
  it("permits safe relative application paths", () => {
    expect(getSafeReturnTo("/student/dashboard")).toBe("/student/dashboard");
    expect(getSafeReturnTo("/staff/queue")).toBe("/staff/queue");
    expect(getSafeReturnTo("/profile")).toBe("/profile");
  });

  it.each([
    "https://evil.com",
    "http://localhost:3000",
    "//evil.com",
    "javascript:alert(1)",
    "data:text/html,evil",
    "/\\evil.com",
    "/../secret",
    "",
    null,
    undefined,
  ])("rejects open redirects and dangerous schemes: %s", (target) => {
    expect(getSafeReturnTo(target, "STUDENT")).toBe("/student/dashboard");
    expect(getSafeReturnTo(target, "STAFF")).toBe("/staff/dashboard");
    expect(getSafeReturnTo(target, "ADMIN")).toBe("/admin/dashboard");
    expect(getSafeReturnTo(target)).toBe("/");
  });
});

describe("Auth and User API Client", () => {
  it("executes login and parses session data", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: {
          user: mockUser,
          accessToken: "jwt-token-123",
          expiresIn: 600,
        },
        meta: { requestId },
      })
    );

    const client = createApiClient({ baseUrl, fetcher });
    const result = await loginUser(client, {
      email: "alex@hostel.edu",
      password: "password123456",
    });

    expect(result.accessToken).toBe("jwt-token-123");
    expect(result.user.name).toBe("Alex Sharma");
    expect(fetcher).toHaveBeenCalledWith(
      `${baseUrl}/auth/login`,
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      })
    );
  });

  it("executes student registration without setting frontend session", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          data: { user: mockUser },
          meta: { requestId },
        },
        { status: 201 }
      )
    );

    const client = createApiClient({ baseUrl, fetcher });
    const result = await registerStudent(client, {
      name: "Alex Sharma",
      email: "alex@hostel.edu",
      password: "securepassword123",
      hostelId: "67140e4cf8d7455d3e0906e1",
      blockId: "67140e4cf8d7455d3e0906e2",
      roomId: "67140e4cf8d7455d3e0906e3",
      enrollmentCode: "CODE123456",
    });

    expect(result.user.id).toBe(mockUser.id);
  });

  it("handles token refresh", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: {
          user: mockUser,
          accessToken: "refreshed-jwt-456",
          expiresIn: 600,
        },
        meta: { requestId },
      })
    );

    const client = createApiClient({ baseUrl, fetcher });
    const result = await refreshSession(client);
    expect(result.accessToken).toBe("refreshed-jwt-456");
  });

  it("performs logout sending credentials and CSRF protection", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const client = createApiClient({
      baseUrl,
      fetcher,
      getAccessToken: () => "token-to-revoke",
    });

    await logoutUser(client);
    expect(fetcher).toHaveBeenCalledWith(
      `${baseUrl}/auth/logout`,
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      })
    );
  });

  it("retries a GET request once when onUnauthorized supplies a fresh token", async () => {
    let callCount = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return Response.json(
          { error: { code: "TOKEN_EXPIRED", message: "Token expired", requestId } },
          { status: 401 }
        );
      }
      return Response.json({
        data: { user: mockUser },
        meta: { requestId },
      });
    });

    let currentToken = "old-expired-token";
    const onUnauthorized = vi.fn().mockImplementation(async () => {
      currentToken = "fresh-new-token";
      return currentToken;
    });

    const client = createApiClient({
      baseUrl,
      fetcher,
      getAccessToken: () => currentToken,
      onUnauthorized,
    });

    const result = await getMe(client);
    expect(result.user.name).toBe("Alex Sharma");
    expect(callCount).toBe(2);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("does not retry mutations when a 401 occurs", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { error: { code: "UNAUTHORIZED", message: "Session expired", requestId } },
        { status: 401 }
      )
    );

    const onUnauthorized = vi.fn().mockResolvedValue("new-token");
    const client = createApiClient({
      baseUrl,
      fetcher,
      onUnauthorized,
    });

    await expect(
      changePassword(client, {
        currentPassword: "oldpassword1234",
        newPassword: "newpassword1234",
        confirmPassword: "newpassword1234",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
