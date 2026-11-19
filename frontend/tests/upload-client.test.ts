import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../src/lib/api/client';
import { uploadAttachment } from '../src/lib/api/complaints';
const baseUrl = 'https://api.example.test/api/v1';
const requestId = '7dc4e59c-a102-46a4-9530-45b33331c391';
const attachment = {
  id: '670000000000000000000501',
  originalName: 'photo.png',
  mimeType: 'image/png',
  sizeBytes: 4,
  width: 1,
  height: 1,
  url: '/api/v1/uploads/670000000000000000000501/content',
};
describe('private upload transport', () => {
  it('unwraps the real backend envelope and uses current authentication and multipart headers', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: { attachment, expiresAt: '2026-11-19T17:00:00.000Z' },
        meta: { requestId },
      })
    );
    const client = createApiClient({
      baseUrl,
      fetcher,
      ensureAccessToken: async () => 'current',
    });
    expect(
      await uploadAttachment(client, new File(['test'], 'photo.png'))
    ).toEqual(attachment);
    const options = fetcher.mock.calls[0]?.[1];
    const headers = new Headers(options?.headers);
    expect(headers.get('Authorization')).toBe('Bearer current');
    expect(headers.get('X-CSRF-Protection')).toBe('1');
    expect(headers.has('Content-Type')).toBe(false);
    expect(options).toMatchObject({
      credentials: 'include',
      redirect: 'error',
      cache: 'no-store',
    });
    expect(options?.body).toBeInstanceOf(FormData);
  });
  it('rejects a malformed upload response', async () => {
    const client = createApiClient({
      baseUrl,
      fetcher: vi
        .fn()
        .mockResolvedValue(
          Response.json({ data: attachment, meta: { requestId } })
        ),
    });
    await expect(
      uploadAttachment(client, new File(['test'], 'photo.png'))
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('normalizes errors and authorizes private blob retrieval', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('png', { headers: { 'Content-Type': 'image/png' } })
      );
    const client = createApiClient({
      baseUrl,
      fetcher,
      getAccessToken: () => 'current',
    });
    expect(
      (await client.requestBlob('/uploads/670000000000000000000501/content'))
        .type
    ).toBe('image/png');
    expect(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('Authorization')
    ).toBe('Bearer current');
    fetcher.mockResolvedValue(
      Response.json(
        { error: { code: 'FORBIDDEN', message: 'Forbidden.', requestId } },
        { status: 403 }
      )
    );
    await expect(
      uploadAttachment(client, new File(['test'], 'photo.png'))
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });
});
