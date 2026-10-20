import { z } from "zod";
import type { ApiClient } from "./client";
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
} from "@/features/complaints/types";
import type {
  CreateComplaintFormData,
  EditComplaintFormData,
  CommentFormData,
} from "@/features/complaints/schemas";

const passThrough = z.custom<unknown>();

export async function getStudentDashboard(
  client: ApiClient,
  filters?: Record<string, string | number | boolean | null | undefined>
): Promise<StudentDashboardData> {
  const response = await client.request(
    "/dashboard/student",
    passThrough,
    { query: filters }
  );
  return response.data as StudentDashboardData;
}

export async function getStaffDashboard(
  client: ApiClient,
  filters?: Record<string, string | number | boolean | null | undefined>
): Promise<StaffDashboardData> {
  const response = await client.request(
    "/dashboard/staff",
    passThrough,
    { query: filters }
  );
  return response.data as StaffDashboardData;
}

export async function getAdminDashboard(
  client: ApiClient,
  filters?: Record<string, string | number | boolean | null | undefined>
): Promise<AdminDashboardData> {
  const response = await client.request(
    "/dashboard/admin",
    passThrough,
    { query: filters }
  );
  return response.data as AdminDashboardData;
}

export async function listComplaints(
  client: ApiClient,
  filters?: Record<string, string | number | boolean | null | undefined>
): Promise<{ data: ComplaintSummary[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
  const response = await client.request(
    "/complaints",
    z.array(passThrough),
    { query: filters }
  );
  return {
    data: response.data as ComplaintSummary[],
    meta: response.meta as unknown as { page: number; limit: number; total: number; totalPages: number },
  };
}

export async function getComplaintDetail(
  client: ApiClient,
  complaintId: string
): Promise<ComplaintDetail> {
  const response = await client.request(
    `/complaints/${encodeURIComponent(complaintId)}`,
    passThrough
  );
  return response.data as ComplaintDetail;
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
      ...(data.location.type === "ROOM"
        ? { blockId: data.location.blockId, roomId: data.location.roomId }
        : {}),
      ...(data.location.type === "BLOCK_COMMON"
        ? { blockId: data.location.blockId, areaLabel: data.location.areaLabel }
        : {}),
      ...(data.location.type === "HOSTEL_COMMON"
        ? { areaLabel: data.location.areaLabel }
        : {}),
    },
    indicators: data.indicators,
    attachmentIds: data.attachmentIds || [],
    clientRequestId: data.clientRequestId,
  };

  const response = await client.request(
    "/complaints",
    passThrough,
    {
      method: "POST",
      body: payload,
    }
  );
  return response.data as ComplaintDetail;
}

export async function editComplaint(
  client: ApiClient,
  complaintId: string,
  data: EditComplaintFormData
): Promise<ComplaintDetail> {
  const response = await client.request(
    `/complaints/${encodeURIComponent(complaintId)}`,
    passThrough,
    {
      method: "PATCH",
      body: data,
    }
  );
  return response.data as ComplaintDetail;
}

export async function listComments(
  client: ApiClient,
  complaintId: string,
  pagination?: { page?: number; limit?: number }
): Promise<CommentItem[]> {
  const response = await client.request(
    `/complaints/${encodeURIComponent(complaintId)}/comments`,
    z.array(passThrough),
    { query: pagination }
  );
  return response.data as CommentItem[];
}

export async function addComment(
  client: ApiClient,
  complaintId: string,
  data: CommentFormData
): Promise<CommentItem> {
  const response = await client.request(
    `/complaints/${encodeURIComponent(complaintId)}/comments`,
    passThrough,
    {
      method: "POST",
      body: data,
    }
  );
  return response.data as CommentItem;
}

export async function listActivities(
  client: ApiClient,
  complaintId: string,
  pagination?: { page?: number; limit?: number }
): Promise<ActivityItem[]> {
  const response = await client.request(
    `/complaints/${encodeURIComponent(complaintId)}/activity`,
    z.array(passThrough),
    { query: pagination }
  );
  return response.data as ActivityItem[];
}

export async function transitionComplaint(
  client: ApiClient,
  complaintId: string,
  payload: Record<string, unknown>
): Promise<ComplaintDetail> {
  const response = await client.request(
    `/complaints/${encodeURIComponent(complaintId)}/transitions`,
    passThrough,
    {
      method: "POST",
      body: payload,
    }
  );
  return response.data as ComplaintDetail;
}

export async function assignComplaint(
  client: ApiClient,
  complaintId: string,
  payload: { expectedVersion: number; staffId: string; note: string }
): Promise<ComplaintDetail> {
  const response = await client.request(
    `/complaints/${encodeURIComponent(complaintId)}/assignment`,
    passThrough,
    {
      method: "POST",
      body: payload,
    }
  );
  return response.data as ComplaintDetail;
}

export async function overridePriority(
  client: ApiClient,
  complaintId: string,
  payload: { expectedVersion: number; priority: string; reason: string }
): Promise<ComplaintDetail> {
  const response = await client.request(
    `/complaints/${encodeURIComponent(complaintId)}/priority`,
    passThrough,
    {
      method: "POST",
      body: payload,
    }
  );
  return response.data as ComplaintDetail;
}

export async function reopenComplaint(
  client: ApiClient,
  complaintId: string,
  payload: { expectedVersion: number; reason: string }
): Promise<ComplaintDetail> {
  const response = await client.request(
    `/complaints/${encodeURIComponent(complaintId)}/reopen`,
    passThrough,
    {
      method: "POST",
      body: payload,
    }
  );
  return response.data as ComplaintDetail;
}

export async function submitFeedback(
  client: ApiClient,
  complaintId: string,
  payload: { expectedVersion: number; rating: number; comment?: string }
): Promise<FeedbackItem> {
  const response = await client.request(
    `/complaints/${encodeURIComponent(complaintId)}/feedback`,
    passThrough,
    {
      method: "POST",
      body: payload,
    }
  );
  return response.data as FeedbackItem;
}

export async function getCategories(
  client: ApiClient,
  hostelId: string
): Promise<CategoryItem[]> {
  const response = await client.request(
    "/categories",
    z.array(passThrough),
    { query: { hostelId, limit: 100 } }
  );
  return response.data as CategoryItem[];
}

export async function getAdminStaff(
  client: ApiClient,
  query: { hostelId: string; eligibleForComplaintId?: string }
): Promise<AdminStaffItem[]> {
  const response = await client.request(
    "/admin/staff",
    z.array(passThrough),
    { query: { ...query, limit: 100 } }
  );
  return response.data as AdminStaffItem[];
}

export async function uploadAttachment(
  client: ApiClient,
  file: File,
  accessToken?: string | null
): Promise<AttachmentItem> {
  const formData = new FormData();
  formData.append("file", file);

  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000/api/v1";
  const headers = new Headers({
    Accept: "application/json",
    "X-CSRF-Protection": "1",
  });
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${baseUrl}/uploads`, {
    method: "POST",
    headers,
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const errorBody: unknown = await response.json().catch(() => null);
    throw new Error(
      (errorBody as { error?: { message?: string } })?.error?.message ||
        "Failed to upload photo"
    );
  }

  const result = (await response.json()) as { data: AttachmentItem };
  return result.data;
}

export async function deleteAttachment(
  client: ApiClient,
  attachmentId: string
): Promise<void> {
  await client.requestNoContent(`/uploads/${encodeURIComponent(attachmentId)}`, {
    method: "DELETE",
  });
}
