import { z } from 'zod';
import { ApiError, normalizeApiError } from './errors';
import { buildApiUrl, validateApiBaseUrl, type Query } from './url';

const metaSchema = z
  .object({ requestId: z.string().uuid() })
  .catchall(z.unknown());
export type ApiMeta = z.infer<typeof metaSchema>;
export type ApiResponse<T> = { data: T; meta: ApiMeta };
export const paginationSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export type Pagination = z.infer<typeof paginationSchema>;
export type ApiPage<T> = { data: T[]; meta: Pagination };
export type RequestOptions = {
  query?: Query;
  signal?: AbortSignal;
  formData?: FormData;
} & (
  | { method?: 'GET'; body?: never }
  | { method: 'POST' | 'PATCH' | 'DELETE'; body?: unknown }
);

type ClientOptions = {
  baseUrl: string;
  fetcher?: typeof fetch;
  // Session 4 supplies a callback to in-memory state; this client stores no token.
  getAccessToken?: () => string | null;
  onUnauthorized?: () => Promise<string | null>;
  ensureAccessToken?: () => Promise<string | null>;
  timeoutMs?: number;
};

export function createApiClient({
  baseUrl,
  fetcher = fetch,
  getAccessToken,
  onUnauthorized,
  ensureAccessToken,
  timeoutMs = 15_000,
}: ClientOptions) {
  const base = validateApiBaseUrl(baseUrl);

  async function execute(
    path: string,
    options: RequestOptions = {},
    isRetry = false
  ): Promise<Response> {
    const url = buildApiUrl(base, path, options.query);
    const method = options.method ?? 'GET';
    const headers = new Headers({ Accept: 'application/json' });
    const token = ensureAccessToken
      ? await ensureAccessToken()
      : getAccessToken?.();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (method !== 'GET') headers.set('X-CSRF-Protection', '1');
    if (options.body !== undefined && !options.formData)
      headers.set('Content-Type', 'application/json');
    const deadline = AbortSignal.timeout(timeoutMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, deadline])
      : deadline;
    let response: Response;
    try {
      response = await fetcher(url, {
        method,
        headers,
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
        signal,
        ...(options.formData
          ? { body: options.formData }
          : options.body !== undefined
            ? { body: JSON.stringify(options.body) }
            : {}),
      });
    } catch {
      if (options.signal?.aborted)
        throw new ApiError('Request cancelled.', 'REQUEST_ABORTED');
      if (deadline.aborted)
        throw new ApiError(
          'The request took too long. Please try again.',
          'REQUEST_TIMEOUT'
        );
      throw new ApiError(
        'Unable to reach HostelFix. Check your connection and try again.',
        'NETWORK_ERROR'
      );
    }

    if (response.status === 401 && !isRetry && onUnauthorized) {
      const newToken = await onUnauthorized().catch(() => null);
      if (newToken && method === 'GET') {
        return execute(path, options, true);
      }
    }

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      throw normalizeApiError(body, response);
    }
    return response;
  }

  return {
    async requestPage<T>(
      path: string,
      schema: z.ZodType<T>,
      options: RequestOptions = {}
    ): Promise<ApiPage<T>> {
      const response = await execute(path, options);
      const parsed = z
        .object({
          data: z.array(schema),
          meta: metaSchema.and(paginationSchema),
        })
        .safeParse(await response.json().catch(() => null));
      if (!parsed.success)
        throw new ApiError(
          'HostelFix returned an unexpected page.',
          'INVALID_RESPONSE',
          response.status
        );
      return parsed.data;
    },
    async requestBlob(
      path: string,
      options: RequestOptions = {}
    ): Promise<Blob> {
      const response = await execute(path, options);
      const mimeType = response.headers.get('Content-Type')?.split(';')[0];
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType ?? ''))
        throw new ApiError(
          'Unexpected photo response.',
          'INVALID_RESPONSE',
          response.status
        );
      const blob = await response.blob();
      if (blob.size > 5 * 1024 * 1024)
        throw new ApiError(
          'Photo exceeds the size limit.',
          'INVALID_RESPONSE',
          response.status
        );
      return blob;
    },
    async request<T>(
      path: string,
      schema: z.ZodType<T>,
      options: RequestOptions = {}
    ): Promise<ApiResponse<T>> {
      const response = await execute(path, options);
      const body: unknown = await response.json().catch(() => null);
      const parsed = z
        .object({ data: schema, meta: metaSchema })
        .safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          'HostelFix returned an unexpected response. Please try again.',
          'INVALID_RESPONSE',
          response.status
        );
      return parsed.data;
    },
    async requestNoContent(
      path: string,
      options: RequestOptions
    ): Promise<void> {
      const response = await execute(path, options);
      if (response.status !== 204)
        throw new ApiError(
          'HostelFix returned an unexpected response.',
          'INVALID_RESPONSE',
          response.status
        );
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
