import { z } from "zod";
import { createApiClient, type ApiClient } from "./client";
import { validateApiBaseUrl } from "./url";

export function configuredApiClient() {
  // Evaluated on use, not at import/build; there is no silent production fallback.
  return createApiClient({ baseUrl: validateApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL) });
}

// Initial confirmed endpoints; auth/profile integration belongs to Sessions 3–4.
export function getLiveness(client: ApiClient) {
  return client.request("/health", z.object({ status: z.literal("ok") }));
}

export function getReadiness(client: ApiClient) {
  return client.request("/health/ready", z.object({ status: z.literal("ready") }));
}
