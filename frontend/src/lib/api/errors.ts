import { z } from 'zod';

const errorEnvelope = z.object({
  error: z.object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/),
    message: z.string().min(1).max(2000),
    requestId: z.string().uuid(),
    fields: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .optional(),
  }),
});

export class ApiError extends Error {
  readonly name = 'ApiError';
  constructor(
    message: string,
    readonly code: string,
    readonly status: number = 0,
    readonly requestId?: string,
    readonly fields?: { path: string; message: string }[],
    readonly retryAfter?: string
  ) {
    super(message);
  }
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function normalizeApiError(body: unknown, response: Response): ApiError {
  const parsed = errorEnvelope.safeParse(body);
  const retryAfter = response.headers.get('Retry-After') ?? undefined;
  if (parsed.success) {
    const { code, message, requestId, fields } = parsed.data.error;
    return new ApiError(
      message,
      code,
      response.status,
      requestId,
      fields,
      retryAfter
    );
  }
  // Never surface HTML, raw response text, exception messages, or stack traces.
  return new ApiError(
    'We couldn’t complete the request. Please try again.',
    'HTTP_ERROR',
    response.status,
    undefined,
    undefined,
    retryAfter
  );
}
