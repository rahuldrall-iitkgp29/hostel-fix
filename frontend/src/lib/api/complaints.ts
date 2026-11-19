import { z } from 'zod';
import type { ApiClient } from './client';
import {
  attachmentSchema,
  complaintSummarySchema,
  complaintDetailSchema,
  commentSchema,
  activitySchema,
  feedbackSchema,
  categorySchema,
  staffSchema,
  studentDashboardSchema,
  staffDashboardSchema,
  adminDashboardSchema,
} from '@/features/complaints/response-schemas';
import type {
  ComplaintSummary,
  ComplaintDetail,
  StudentDashboardData,
  StaffDashboardData,
  AdminDashboardData,
  ActivityItem,
  CommentItem,
  AttachmentItem,
  FeedbackItem,
  CategoryItem,
  AdminStaffItem,
} from '@/features/complaints/types';
import type {
  CreateComplaintFormData,
  EditComplaintFormData,
  CommentFormData,
} from '@/features/complaints/schemas';

export async function getStudentDashboard(
  client: ApiClient,
  filters?: Record<string, string | number | boolean | null | undefined>
): Promise<StudentDashboardData> {
  const response = await client.request(
    '/dashboard/student',
    studentDashboardSchema,
    {
      query: filters,
    }
  );
  return response.data;
}

export async function getStaffDashboard(
  client: ApiClient,
  filters?: Record<string, string | number | boolean | null | undefined>
): Promise<StaffDashboardData> {
  const response = await client.request(
    '/dashboard/staff',
    staffDashboardSchema,
    {
      query: filters,
    }
  );
  return response.data;
}

export async function getAdminDashboard(
  client: ApiClient,
  filters?: Record<string, string | number | boolean | null | undefined>
): Promise<AdminDashboardData> {
  const response = await client.request(
    '/dashboard/admin',
    adminDashboardSchema,
    {
      query: filters,
    }
  );
  return response.data;
}

export async function listComplaints(
  client: ApiClient,
  filters?: Record<string, string | number | boolean | null | undefined>
): Promise<{
  data: ComplaintSummary[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}> {
  return client.requestPage('/complaints', complaintSummarySchema, {
    query: filters,
  });
}

export async function getComplaintDetail(
  client: ApiClient,
  complaintId: string
): Promise<ComplaintDetail> {
  const response = await client.request(
    `/complaints/${encodeURIComponent(complaintId)}`,
    z.object({ complaint: complaintDetailSchema })
  );
  return response.data.complaint;
}

export async function createComplaint(
  client: ApiClient,
  data: CreateComplaintFormData & { clientRequestId: string }
): Promise<ComplaintDetail> {
  const payload: Record<string, unknown> = {
    title: data.title,
    description: data.description,
    categoryId: data.categoryId,
    location: {
      type: data.location.type,
      hostelId: data.location.hostelId,
      ...(data.location.type === 'ROOM'
        ? { blockId: data.location.blockId, roomId: data.location.roomId }
        : {}),
      ...(data.location.type === 'BLOCK_COMMON'
        ? { blockId: data.location.blockId, areaLabel: data.location.areaLabel }
        : {}),
      ...(data.location.type === 'HOSTEL_COMMON'
        ? { areaLabel: data.location.areaLabel }
        : {}),
    },
    indicators: data.indicators,
    attachmentIds: data.attachmentIds || [],
    clientRequestId: data.clientRequestId,
  };

  const response = await client.request(
    '/complaints',
    z.object({ complaint: complaintDetailSchema }),
    {
      method: 'POST',
      body: payload,
    }
  );
  return response.data.complaint;
}

export async function editComplaint(
  client: ApiClient,
  complaintId: string,
  data: EditComplaintFormData
): Promise<ComplaintDetail> {
  const response = await client.request(
    `/complaints/${encodeURIComponent(complaintId)}`,
    z.object({ complaint: complaintDetailSchema }),
    {
      method: 'PATCH',
      body: data,
    }
  );
  return response.data.complaint;
}

export async function listComments(
  client: ApiClient,
  complaintId: string,
  pagination?: { page?: number; limit?: number }
): Promise<CommentItem[]> {
  const response = await client.request(
    `/complaints/${encodeURIComponent(complaintId)}/comments`,
    z.array(commentSchema),
    { query: pagination }
  );
  return response.data;
}

export async function addComment(
  client: ApiClient,
  complaintId: string,
  data: CommentFormData
): Promise<CommentItem> {
  const response = await client.request(
    `/complaints/${encodeURIComponent(complaintId)}/comments`,
    z.object({ comment: commentSchema }),
    {
      method: 'POST',
      body: data,
    }
  );
  return response.data.comment;
}

export async function listActivities(
  client: ApiClient,
  complaintId: string,
  pagination?: { page?: number; limit?: number }
): Promise<ActivityItem[]> {
  const response = await client.request(
    `/complaints/${encodeURIComponent(complaintId)}/activity`,
    z.array(activitySchema),
    { query: pagination }
  );
  return response.data;
}

export async function transitionComplaint(
  client: ApiClient,
  complaintId: string,
  payload: Record<string, unknown>
): Promise<ComplaintDetail> {
  const response = await client.request(
    `/complaints/${encodeURIComponent(complaintId)}/transitions`,
    z.object({ complaint: complaintDetailSchema }),
    {
      method: 'POST',
      body: payload,
    }
  );
  return response.data.complaint;
}

export async function assignComplaint(
  client: ApiClient,
  complaintId: string,
  payload: { expectedVersion: number; staffId: string; note: string }
): Promise<ComplaintDetail> {
  const response = await client.request(
    `/complaints/${encodeURIComponent(complaintId)}/assignment`,
    z.object({ complaint: complaintDetailSchema }),
    {
      method: 'POST',
      body: payload,
    }
  );
  return response.data.complaint;
}

export async function overridePriority(
  client: ApiClient,
  complaintId: string,
  payload: { expectedVersion: number; priority: string; reason: string }
): Promise<ComplaintDetail> {
  const response = await client.request(
    `/complaints/${encodeURIComponent(complaintId)}/priority`,
    z.object({ complaint: complaintDetailSchema }),
    {
      method: 'POST',
      body: payload,
    }
  );
  return response.data.complaint;
}

export async function reopenComplaint(
  client: ApiClient,
  complaintId: string,
  payload: { expectedVersion: number; reason: string }
): Promise<ComplaintDetail> {
  const response = await client.request(
    `/complaints/${encodeURIComponent(complaintId)}/reopen`,
    z.object({ complaint: complaintDetailSchema }),
    {
      method: 'POST',
      body: payload,
    }
  );
  return response.data.complaint;
}

export async function submitFeedback(
  client: ApiClient,
  complaintId: string,
  payload: { expectedVersion: number; rating: number; comment?: string }
): Promise<FeedbackItem> {
  const response = await client.request(
    `/complaints/${encodeURIComponent(complaintId)}/feedback`,
    z.object({ feedback: feedbackSchema }),
    {
      method: 'POST',
      body: payload,
    }
  );
  return response.data.feedback;
}

export async function getCategories(
  client: ApiClient,
  hostelId: string
): Promise<CategoryItem[]> {
  const response = await client.request(
    '/categories',
    z.array(categorySchema),
    {
      query: { hostelId, limit: 100 },
    }
  );
  return response.data;
}

export async function getAdminStaff(
  client: ApiClient,
  query: { hostelId: string; eligibleForComplaintId?: string }
): Promise<AdminStaffItem[]> {
  const response = await client.request('/admin/staff', z.array(staffSchema), {
    query: { ...query, limit: 100 },
  });
  return response.data;
}

export async function uploadAttachment(
  client: ApiClient,
  file: File
): Promise<AttachmentItem> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await client.request(
    '/uploads',
    z.object({
      attachment: attachmentSchema,
      expiresAt: z.iso.datetime(),
    }),
    { method: 'POST', formData }
  );
  return response.data.attachment;
}

export async function deleteAttachment(
  client: ApiClient,
  attachmentId: string
): Promise<void> {
  await client.requestNoContent(
    `/uploads/${encodeURIComponent(attachmentId)}`,
    {
      method: 'DELETE',
    }
  );
}

export function getCommentsPage(
  client: ApiClient,
  complaintId: string,
  page: number
) {
  return client.requestPage(
    `/complaints/${encodeURIComponent(complaintId)}/comments`,
    commentSchema,
    { query: { page, limit: 20 } }
  );
}
export function getActivitiesPage(
  client: ApiClient,
  complaintId: string,
  page: number
) {
  return client.requestPage(
    `/complaints/${encodeURIComponent(complaintId)}/activity`,
    activitySchema,
    { query: { page, limit: 20 } }
  );
}
export function getAttachmentContent(
  client: ApiClient,
  attachmentId: string,
  signal?: AbortSignal
) {
  return client.requestBlob(
    `/uploads/${encodeURIComponent(attachmentId)}/content`,
    { signal }
  );
}
