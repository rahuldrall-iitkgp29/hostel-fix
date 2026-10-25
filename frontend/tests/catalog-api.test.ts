import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../src/lib/api/client';
import { getHostels, getHostelBlocks, getRooms } from '../src/lib/api/catalog';

const baseUrl = 'http://localhost:5000/api/v1';
const requestId = '7dc4e59c-a102-46a4-9530-45b33331c391';

describe('Catalog API Client', () => {
  it('fetches the list of hostels with pagination limit', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [
          {
            id: '67140e4cf8d7455d3e0906e1',
            name: 'Cauvery Hostel',
            code: 'CVR',
          },
          {
            id: '67140e4cf8d7455d3e0906e2',
            name: 'Krishna Hostel',
            code: 'KRS',
          },
        ],
        meta: { requestId, total: 2, page: 1, limit: 100, totalPages: 1 },
      })
    );

    const client = createApiClient({ baseUrl, fetcher });
    const hostels = await getHostels(client);

    expect(hostels).toHaveLength(2);
    expect(hostels[0]?.name).toBe('Cauvery Hostel');
    expect(fetcher).toHaveBeenCalledWith(
      `${baseUrl}/catalog/hostels?limit=100`,
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('fetches blocks for a selected hostel', async () => {
    const hostelId = '67140e4cf8d7455d3e0906e1';
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [
          { id: '67140e4cf8d7455d3e0906e3', name: 'Block A', code: 'A' },
          { id: '67140e4cf8d7455d3e0906e4', name: 'Block B', code: 'B' },
        ],
        meta: { requestId },
      })
    );

    const client = createApiClient({ baseUrl, fetcher });
    const blocks = await getHostelBlocks(client, hostelId);

    expect(blocks).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledWith(
      `${baseUrl}/catalog/hostels/${hostelId}/blocks`,
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('fetches rooms for a selected hostel and block', async () => {
    const hostelId = '67140e4cf8d7455d3e0906e1';
    const blockId = '67140e4cf8d7455d3e0906e3';
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [
          { id: '67140e4cf8d7455d3e0906e5', hostelId, blockId, label: '101' },
          { id: '67140e4cf8d7455d3e0906e6', hostelId, blockId, label: '102' },
        ],
        meta: { requestId, total: 2, page: 1, limit: 100, totalPages: 1 },
      })
    );

    const client = createApiClient({ baseUrl, fetcher });
    const rooms = await getRooms(client, hostelId, blockId);

    expect(rooms).toHaveLength(2);
    expect(rooms[0]?.label).toBe('101');
    expect(fetcher).toHaveBeenCalledWith(
      `${baseUrl}/catalog/rooms?hostelId=${hostelId}&blockId=${blockId}&limit=100`,
      expect.objectContaining({ method: 'GET' })
    );
  });
});
