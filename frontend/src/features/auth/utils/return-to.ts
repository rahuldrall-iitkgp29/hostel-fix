import type { UserRole } from "../types";

export function getSafeReturnTo(
  returnTo: string | null | undefined,
  role?: UserRole
): string {
  const fallback = role
    ? `/${role.toLowerCase()}/dashboard`
    : "/";

  if (!returnTo || typeof returnTo !== "string") {
    return fallback;
  }

  const trimmed = returnTo.trim();

  // Must start with a single slash, not double slash (protocol-relative URL)
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  // Reject URLs with colons (schemes like javascript:, data:) or backslashes
  if (trimmed.includes(":") || trimmed.includes("\\")) {
    return fallback;
  }

  // Reject relative navigation outside root
  if (trimmed.includes("/../") || trimmed.endsWith("/..")) {
    return fallback;
  }

  return trimmed;
}
