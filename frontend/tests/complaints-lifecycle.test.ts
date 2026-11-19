import { describe, expect, it, vi } from 'vitest';
import {
  complaint,
  staffDashboard,
  adminDashboard,
  feedback,
} from './fixtures/complaints';
import {
  createComplaintSchema,
  editComplaintSchema,
  commentSchema,
  triageSchema,
  rejectSchema,
  resolveSchema,
  reopenSchema,
  feedbackSchema,
} from '../src/features/complaints/schemas';
import { createApiClient } from '../src/lib/api/client';
import {
  getStudentDashboard,
  getStaffDashboard,
  getAdminDashboard,
  listComplaints,
  getComplaintDetail,
  createComplaint,
  addComment,
  transitionComplaint,
  assignComplaint,
  reopenComplaint,
  submitFeedback,
  getCategories,
  getAdminStaff,
} from '../src/lib/api/complaints';

const baseUrl = 'http://localhost:5000/api/v1';
const requestId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('Complaints Schemas Validation', () => {
  it('validates room complaint location correctly', () => {
    const valid = createComplaintSchema.safeParse({
      title: 'Broken window latch',
      description:
        'The window latch in my room is completely broken and cannot latch.',
      categoryId: '67140e4cf8d7455d3e0906e1',
      location: {
        type: 'ROOM',
        hostelId: '67140e4cf8d7455d3e0906e2',
        blockId: '67140e4cf8d7455d3e0906e3',
        roomId: '67140e4cf8d7455d3e0906e4',
      },
      indicators: {
        safetyRisk: false,
        essentialServiceOutage: false,
        affectsMultipleRooms: false,
        functionalityLoss: true,
      },
      attachmentIds: [],
    });
    expect(valid.success).toBe(true);
  });

  it('requires areaLabel for block and hostel common locations', () => {
    const invalidBlock = createComplaintSchema.safeParse({
      title: 'Leaking faucet in corridor',
      description:
        'The tap in the shared bathroom is leaking water continuously.',
      categoryId: '67140e4cf8d7455d3e0906e1',
      location: {
        type: 'BLOCK_COMMON',
        hostelId: '67140e4cf8d7455d3e0906e2',
        blockId: '67140e4cf8d7455d3e0906e3',
        areaLabel: '',
      },
      indicators: {
        safetyRisk: false,
        essentialServiceOutage: false,
        affectsMultipleRooms: true,
        functionalityLoss: false,
      },
      attachmentIds: [],
    });
    expect(invalidBlock.success).toBe(false);

    const validBlock = createComplaintSchema.safeParse({
      title: 'Leaking faucet in corridor',
      description:
        'The tap in the shared bathroom is leaking water continuously.',
      categoryId: '67140e4cf8d7455d3e0906e1',
      location: {
        type: 'BLOCK_COMMON',
        hostelId: '67140e4cf8d7455d3e0906e2',
        blockId: '67140e4cf8d7455d3e0906e3',
        areaLabel: '2nd Floor West Washroom',
      },
      indicators: {
        safetyRisk: false,
        essentialServiceOutage: false,
        affectsMultipleRooms: true,
        functionalityLoss: false,
      },
      attachmentIds: [],
    });
    expect(validBlock.success).toBe(true);
  });

  it('enforces minimum lengths on title and description', () => {
    const short = createComplaintSchema.safeParse({
      title: 'Short',
      description: 'Too short',
      categoryId: '67140e4cf8d7455d3e0906e1',
      location: {
        type: 'ROOM',
        hostelId: '67140e4cf8d7455d3e0906e2',
        blockId: '67140e4cf8d7455d3e0906e3',
        roomId: '67140e4cf8d7455d3e0906e4',
      },
      indicators: {
        safetyRisk: false,
        essentialServiceOutage: false,
        affectsMultipleRooms: false,
        functionalityLoss: false,
      },
      attachmentIds: [],
    });
    expect(short.success).toBe(false);
  });

  it('validates transition notes length constraints', () => {
    // Triage note min 10
    expect(
      triageSchema.safeParse({ expectedVersion: 1, note: 'short' }).success
    ).toBe(false);
    expect(
      triageSchema.safeParse({
        expectedVersion: 1,
        note: 'Reviewed and confirmed legitimate complaint',
      }).success
    ).toBe(true);

    // Resolve note min 20
    expect(
      resolveSchema.safeParse({ expectedVersion: 1, resolutionNote: 'short' })
        .success
    ).toBe(false);
    expect(
      resolveSchema.safeParse({
        expectedVersion: 1,
        resolutionNote:
          'Replaced the damaged ceiling fan capacitor and tested speed.',
      }).success
    ).toBe(true);

    // Reopen note min 20
    expect(
      reopenSchema.safeParse({ expectedVersion: 1, reason: 'still broken' })
        .success
    ).toBe(false);
    expect(
      reopenSchema.safeParse({
        expectedVersion: 1,
        reason:
          'The ceiling fan started making high-pitched noise again within 2 hours.',
      }).success
    ).toBe(true);

    // Feedback rating 1-5
    expect(
      feedbackSchema.safeParse({ expectedVersion: 1, rating: 0 }).success
    ).toBe(false);
    expect(
      feedbackSchema.safeParse({ expectedVersion: 1, rating: 6 }).success
    ).toBe(false);
    expect(
      feedbackSchema.safeParse({
        expectedVersion: 1,
        rating: 5,
        comment: 'Great work',
      }).success
    ).toBe(true);
  });
});

describe('Complaints API Client', () => {
  it('fetches student dashboard with proper envelope mapping', async () => {
    const mockDashboard = {
      asOf: '2026-10-20T10:00:00.000Z',
      statusCounts: {
        SUBMITTED: 1,
        TRIAGED: 0,
        ASSIGNED: 0,
        IN_PROGRESS: 0,
        RESOLVED: 0,
        CLOSED: 0,
        REOPENED: 0,
        REJECTED: 0,
      },
      total: 1,
      open: 1,
      resolved: 0,
      closed: 0,
      rejected: 0,
      recentComplaints: [],
      latestActivity: [],
    };

    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ data: mockDashboard, meta: { requestId } })
      );

    const client = createApiClient({ baseUrl, fetcher });
    const result = await getStudentDashboard(client);
    expect(result.open).toBe(1);
    expect(fetcher).toHaveBeenCalledWith(
      `${baseUrl}/dashboard/student`,
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('submits complaint creation with clientRequestId idempotency', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          data: { complaint },
          meta: { requestId },
        },
        { status: 201 }
      )
    );

    const client = createApiClient({ baseUrl, fetcher });
    const result = await createComplaint(client, {
      title: 'Ceiling fan bearing failure',
      description:
        'The fan makes loud rattling noises when turned on past level 2.',
      categoryId: '67140e4cf8d7455d3e0906e1',
      location: {
        type: 'ROOM',
        hostelId: '67140e4cf8d7455d3e0906e2',
        blockId: '67140e4cf8d7455d3e0906e3',
        roomId: '67140e4cf8d7455d3e0906e4',
      },
      indicators: {
        safetyRisk: false,
        essentialServiceOutage: false,
        affectsMultipleRooms: false,
        functionalityLoss: true,
      },
      attachmentIds: [],
      clientRequestId: 'e340a631-50e3-469b-8714-9988b47915ec',
    });

    expect(result.reference).toBe('CVR-2026-0001');
    expect(fetcher).toHaveBeenCalledWith(
      `${baseUrl}/complaints`,
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('posts public comments with expectedVersion', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: {
          comment: {
            id: '67140e4cf8d7455d3e0906f1',
            complaintId: '67140e4cf8d7455d3e0906ee',
            author: {
              id: '67140e4cf8d7455d3e0906e5',
              name: 'Alex',
              role: 'STUDENT',
            },
            body: 'Technician can visit between 4pm and 6pm.',
            createdAt: '2026-10-20T11:00:00.000Z',
          },
        },
        meta: { requestId },
      })
    );

    const client = createApiClient({ baseUrl, fetcher });
    const comment = await addComment(client, '67140e4cf8d7455d3e0906ee', {
      expectedVersion: 1,
      body: 'Technician can visit between 4pm and 6pm.',
    });

    expect(comment.author.name).toBe('Alex');
    expect(fetcher).toHaveBeenCalledWith(
      `${baseUrl}/complaints/67140e4cf8d7455d3e0906ee/comments`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('validates edit, reject and comment schemas', () => {
    expect(
      commentSchema.safeParse({ expectedVersion: 1, body: 'Valid comment' })
        .success
    ).toBe(true);
    expect(
      commentSchema.safeParse({ expectedVersion: 1, body: '' }).success
    ).toBe(false);

    expect(
      rejectSchema.safeParse({
        expectedVersion: 1,
        rejectionCode: 'OUT_OF_SCOPE',
        note: 'This is a private student device issue.',
      }).success
    ).toBe(true);

    expect(
      editComplaintSchema.safeParse({
        expectedVersion: 1,
        title: 'Updated Title for Repair',
      }).success
    ).toBe(true);
  });

  it('handles staff/admin dashboards, transitions and assignments via API client', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = String(input);
      const data = url.includes('/dashboard/staff')
        ? staffDashboard
        : url.includes('/dashboard/admin')
          ? adminDashboard
          : url.endsWith('/feedback')
            ? { feedback }
            : url.includes('/categories') ||
                url.includes('/admin/staff') ||
                url.endsWith('/complaints') ||
                url.includes('/complaints?')
              ? []
              : { complaint };
      return Promise.resolve(
        Response.json({
          data,
          meta: { requestId, page: 1, limit: 20, total: 0, totalPages: 0 },
        })
      );
    });
    const client = createApiClient({ baseUrl, fetcher });

    // Transition complaint
    await transitionComplaint(client, '67140e4cf8d7455d3e0906ee', {
      expectedVersion: 1,
      toStatus: 'IN_PROGRESS',
      note: 'Started repair work',
    });
    expect(fetcher).toHaveBeenCalledWith(
      `${baseUrl}/complaints/67140e4cf8d7455d3e0906ee/transitions`,
      expect.objectContaining({ method: 'POST' })
    );

    // Assign complaint
    await assignComplaint(client, '67140e4cf8d7455d3e0906ee', {
      expectedVersion: 1,
      staffId: '67140e4cf8d7455d3e0906aa',
      note: 'Assigned to plumbing staff',
    });
    expect(fetcher).toHaveBeenCalledWith(
      `${baseUrl}/complaints/67140e4cf8d7455d3e0906ee/assignment`,
      expect.objectContaining({ method: 'POST' })
    );

    // Reopen complaint
    await reopenComplaint(client, '67140e4cf8d7455d3e0906ee', {
      expectedVersion: 2,
      reason: 'Tap still drips continuously',
    });
    expect(fetcher).toHaveBeenCalledWith(
      `${baseUrl}/complaints/67140e4cf8d7455d3e0906ee/reopen`,
      expect.objectContaining({ method: 'POST' })
    );

    // Feedback
    await submitFeedback(client, '67140e4cf8d7455d3e0906ee', {
      expectedVersion: 3,
      rating: 5,
      comment: 'Prompt repair, thank you!',
    });
    expect(fetcher).toHaveBeenCalledWith(
      `${baseUrl}/complaints/67140e4cf8d7455d3e0906ee/feedback`,
      expect.objectContaining({ method: 'POST' })
    );

    // Categories
    await getCategories(client, '67140e4cf8d7455d3e0906e2');
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(
        `${baseUrl}/categories?hostelId=67140e4cf8d7455d3e0906e2`
      ),
      expect.anything()
    );

    // Staff list
    await getAdminStaff(client, { hostelId: '67140e4cf8d7455d3e0906e2' });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(
        `${baseUrl}/admin/staff?hostelId=67140e4cf8d7455d3e0906e2`
      ),
      expect.anything()
    );

    // Dashboards and detail
    await getStaffDashboard(client);
    await getAdminDashboard(client);
    await listComplaints(client);
    await getComplaintDetail(client, '67140e4cf8d7455d3e0906ee');
  });
});
