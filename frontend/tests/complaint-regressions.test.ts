import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../src/lib/api/client';
import {
  editComplaint,
  getCommentsPage,
  getComplaintDetail,
} from '../src/lib/api/complaints';
import { createComplaintSubmission } from '../src/features/complaints/submission';
import { loadPrivatePhoto } from '../src/features/complaints/private-photo';
import { getConfiguredApiBaseUrl } from '../src/lib/api/url';
import { complaint } from './fixtures/complaints';
const baseUrl = 'https://api.example.test/api/v1';
const requestId = '7dc4e59c-a102-46a4-9530-45b33331c391';
const draft = {
  title: complaint.title,
  description: complaint.description,
  categoryId: complaint.category!.id,
  location: complaint.location,
  indicators: complaint.indicators,
  attachmentIds: [],
};
afterEach(() => vi.unstubAllGlobals());
describe('complaint regressions', () => {
  it('retains an idempotency key after a lost response and coalesces duplicates', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost response'))
      .mockResolvedValue(complaint);
    const submit = createComplaintSubmission(send, () => 'same-id');
    const input = {
      ...draft,
      location: {
        type: 'ROOM' as const,
        hostelId: complaint.location.hostelId,
        blockId: complaint.location.blockId!,
        roomId: complaint.location.roomId!,
      },
    };
    await expect(submit(input)).rejects.toThrow('lost response');
    await Promise.all([submit(input), submit(input)]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([data]) => data.clientRequestId)).toEqual([
      'same-id',
      'same-id',
    ]);
  });
  it('uses expectedVersion on edits and surfaces a version conflict', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: {
            code: 'VERSION_CONFLICT',
            message: 'Record changed.',
            requestId,
          },
        },
        { status: 409 }
      )
    );
    await expect(
      editComplaint(createApiClient({ baseUrl, fetcher }), complaint.id, {
        expectedVersion: 1,
        title: 'Updated valid title',
      })
    ).rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      expectedVersion: 1,
      title: 'Updated valid title',
    });
  });
  it('rejects malformed complaint fields instead of trusting a TypeScript cast', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: { complaint: { ...complaint, version: 'invalid' } },
        meta: { requestId },
      })
    );
    await expect(
      getComplaintDetail(createApiClient({ baseUrl, fetcher }), complaint.id)
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('validates pagination and requests subsequent comment pages', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [],
        meta: { requestId, page: 2, limit: 20, total: 21, totalPages: 2 },
      })
    );
    const result = await getCommentsPage(
      createApiClient({ baseUrl, fetcher }),
      complaint.id,
      2
    );
    expect(result.meta.page).toBe(2);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('page=2');
    fetcher.mockResolvedValue(Response.json({ data: [], meta: { requestId } }));
    await expect(
      getCommentsPage(createApiClient({ baseUrl, fetcher }), complaint.id, 2)
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('fetches photos with credentials and disposes object URLs', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:private-photo');
    const revokeObjectURL = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('image', { headers: { 'Content-Type': 'image/png' } })
      );
    const photo = await loadPrivatePhoto(
      createApiClient({ baseUrl, fetcher, getAccessToken: () => 'token' }),
      '670000000000000000000501',
      new AbortController().signal
    );
    expect(photo?.url).toBe('blob:private-photo');
    photo?.dispose();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:private-photo');
    expect(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('Authorization')
    ).toBe('Bearer token');
    vi.restoreAllMocks();
  });
  it('rejects missing and insecure production API configuration', () => {
    expect(() => getConfiguredApiBaseUrl('', 'production')).toThrow(
      'NEXT_PUBLIC_API_BASE_URL'
    );
    expect(() =>
      getConfiguredApiBaseUrl('http://localhost:5000/api/v1', 'production')
    ).toThrow('HTTPS');
    expect(getConfiguredApiBaseUrl(baseUrl, 'production')).toBe(baseUrl);
  });
});
