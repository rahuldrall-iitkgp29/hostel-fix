import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApiClient } from '../src/lib/api/client';
import { buildApiUrl, validateApiBaseUrl } from '../src/lib/api/url';
import { getLiveness, getReadiness } from '../src/lib/api/health';

const baseUrl = 'http://localhost:5000/api/v1';
const requestId = '7dc4e59c-a102-46a4-9530-45b33331c391';
const schema = z.object({ status: z.literal('ok') });
const ok = () => Response.json({ data: { status: 'ok' }, meta: { requestId } });

describe('API transport', () => {
  it('validates the confirmed health envelope and sends credentials without caching', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok());
    const result = await getLiveness(createApiClient({ baseUrl, fetcher }));
    expect(result).toEqual({ data: { status: 'ok' }, meta: { requestId } });
    expect(fetcher).toHaveBeenCalledWith(
      `${baseUrl}/health`,
      expect.objectContaining({
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
        method: 'GET',
      })
    );
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.has('Authorization')).toBe(false);
    expect(headers.has('Content-Type')).toBe(false);
  });

  it('validates readiness separately from liveness', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ data: { status: 'ready' }, meta: { requestId } })
      );
    expect(
      (await getReadiness(createApiClient({ baseUrl, fetcher }))).data.status
    ).toBe('ready');
  });

  it.each(['POST', 'PATCH', 'DELETE'] as const)(
    'adds the confirmed CSRF header to %s and lets the browser supply Origin',
    async (method) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 204 }));
      const client = createApiClient({
        baseUrl,
        fetcher,
        getAccessToken: () => 'synthetic-test-value',
      });
      // Test-only resource, never wired as a product endpoint.
      await client.requestNoContent('/test-resource', { method, body: {} });
      const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
      expect(headers.get('X-CSRF-Protection')).toBe('1');
      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get('Authorization')).toBe('Bearer synthetic-test-value');
      expect(headers.has('Origin')).toBe(false);
      expect(fetcher.mock.calls[0]?.[1]?.body).toBe('{}');
    }
  );

  it('preserves structured errors, field paths, request IDs and retry headers', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Check the highlighted fields.',
              requestId,
              fields: [{ path: 'email', message: 'Invalid email.' }],
            },
          },
          { status: 422, headers: { 'Retry-After': '30' } }
        )
      );
    await expect(
      createApiClient({ baseUrl, fetcher }).request('/health', schema)
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 422,
      requestId,
      fields: [{ path: 'email', message: 'Invalid email.' }],
      retryAfter: '30',
    });
  });

  it('does not retry unauthorized requests or invent a refresh call', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          {
            error: {
              code: 'TOKEN_EXPIRED',
              message: 'Session expired.',
              requestId,
            },
          },
          { status: 401 }
        )
      );
    await expect(
      createApiClient({ baseUrl, fetcher }).request('/health', schema)
    ).rejects.toMatchObject({ code: 'TOKEN_EXPIRED', status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('never repeats a mutation after a lost response', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('private network details'));
    await expect(
      createApiClient({ baseUrl, fetcher }).requestNoContent('/test-resource', {
        method: 'POST',
        body: {},
      })
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('normalizes HTML failures without exposing raw content', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('<html>private proxy details</html>', { status: 503 })
      );
    await expect(
      createApiClient({ baseUrl, fetcher }).request('/health', schema)
    ).rejects.toMatchObject({
      code: 'HTTP_ERROR',
      status: 503,
      message: 'We couldn’t complete the request. Please try again.',
    });
  });

  it.each([
    { status: 'ok' },
    { data: { status: 'wrong' }, meta: { requestId } },
    { data: { status: 'ok' }, meta: {} },
  ])('rejects a mismatched success envelope', async (body) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(body));
    await expect(
      createApiClient({ baseUrl, fetcher }).request('/health', schema)
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('distinguishes caller cancellation from network errors', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    await expect(
      createApiClient({ baseUrl, fetcher }).request('/health', schema, {
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
  });

  it('times out a stalled request', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Timed out', 'TimeoutError'))
          );
        })
    );
    await expect(
      createApiClient({ baseUrl, fetcher, timeoutMs: 10 }).request(
        '/health',
        schema
      )
    ).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
  });

  it('rejects a JSON success where a 204 was required', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok());
    await expect(
      createApiClient({ baseUrl, fetcher }).requestNoContent('/test-resource', {
        method: 'POST',
      })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('API URLs', () => {
  it('encodes query text and retains false/zero while omitting absent fields', () => {
    expect(
      buildApiUrl(baseUrl, '/complaints', {
        q: 'tap & fan',
        page: 1,
        unassigned: false,
        count: 0,
        absent: undefined,
        empty: null,
      })
    ).toBe(
      `${baseUrl}/complaints?q=tap+%26+fan&page=1&unassigned=false&count=0`
    );
  });

  it.each([
    'https://attacker.invalid/health',
    '//attacker.invalid/health',
    '/../auth',
    '/%2e%2e/auth',
    '/health?injected=1',
    '/health#fragment',
    '/health\\other',
  ])('rejects unsafe resource path %s before fetch', async (path) => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      createApiClient({ baseUrl, fetcher }).request(path, schema)
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    '',
    'http://example.org/api/v1',
    'https://user:password@example.org/api/v1',
    'https://example.org/api/v1?token=no',
    'https://example.org/api',
    'file:///api/v1',
  ])(
    'rejects missing, insecure, secret-bearing or wrong-namespace base URLs',
    (url) => {
      expect(() => validateApiBaseUrl(url)).toThrow(
        'Set NEXT_PUBLIC_API_BASE_URL'
      );
    }
  );

  it('accepts local HTTP and production HTTPS without a trailing slash', () => {
    expect(validateApiBaseUrl(`${baseUrl}/`)).toBe(baseUrl);
    expect(validateApiBaseUrl('https://api.example.org/api/v1')).toBe(
      'https://api.example.org/api/v1'
    );
  });
});
