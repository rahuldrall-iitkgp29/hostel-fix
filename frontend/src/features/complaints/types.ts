export type ComplaintStatus =
  | 'SUBMITTED'
  | 'TRIAGED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REOPENED'
  | 'REJECTED';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type LocationType = 'ROOM' | 'BLOCK_COMMON' | 'HOSTEL_COMMON';

export type RejectionCode =
  'OUT_OF_SCOPE' | 'INVALID_LOCATION' | 'INSUFFICIENT_INFORMATION';

export type Indicators = {
  safetyRisk: boolean;
  essentialServiceOutage: boolean;
  affectsMultipleRooms: boolean;
  functionalityLoss: boolean;
};

export type LocationData = {
  type: LocationType;
  hostelId: string;
  blockId?: string | null;
  roomId?: string | null;
  areaLabel?: string | null;
  hostelName?: string | null;
  blockName?: string | null;
  roomLabel?: string | null;
};

export type PersonSummary = {
  id: string;
  name: string | null;
};

export type ComplaintSummary = {
  id: string;
  reference: string;
  title: string;
  category: PersonSummary | null;
  location: LocationData;
  status: ComplaintStatus;
  priority: Priority;
  suggestedPriority?: Priority | null;
  prioritySource?: string | null;
  assignee: PersonSummary | null;
  createdAt: string;
  updatedAt: string;
  cycleNumber: number;
  version: number;
  responseDueAt: string | null;
  resolutionDueAt: string | null;
  isResponseOverdue: boolean;
  isResolutionOverdue: boolean;
};

export type AttachmentItem = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  url: string;
};

export type CycleItem = {
  cycleNumber: number;
  startedAt: string | null;
  assigneeId: string | null;
  responseDueAt?: string | null;
  resolutionDueAt?: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  resolverId: string | null;
  resolutionDurationMinutes: number | null;
};

export type FeedbackItem = {
  id: string;
  complaintId: string;
  authorId: string;
  rating: number;
  comment?: string | null;
  cycleNumber: number;
  isCurrent: boolean;
};

export type ComplaintDetail = ComplaintSummary & {
  description: string;
  indicators: Indicators;
  priorityExplanation?: string | null;
  owner: PersonSummary | null;
  attachments: AttachmentItem[];
  currentCycle: CycleItem;
  priorCycles: (CycleItem & {
    reopenedAt: string | null;
    reopenReason: string | null;
  })[];
  resolutionNote?: string | null;
  resolvedAt?: string | null;
  reopenUntil?: string | null;
  reopenCount: number;
  feedback?: FeedbackItem | null;
  allowedActions: string[];
};

export type ActivityItem = {
  id: string;
  complaintId: string;
  type: string;
  actor: { id: string; name: string | null; role: string | null } | null;
  occurredAt: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  note?: string | null;
  changes?: Record<string, unknown> | null;
};

export type CommentItem = {
  id: string;
  complaintId: string;
  author: { id: string; name: string | null; role: string | null };
  body: string;
  createdAt: string;
};

export type CategoryItem = {
  id: string;
  hostelId: string;
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  version: number;
};

export type StaffWorkloadItem = {
  staffId: string;
  name: string;
  assignedPending: number;
  inProgress: number;
  openAssigned: number;
};

export type AdminStaffItem = {
  id: string;
  name: string;
  hostelId: string;
  categoryIds: (string | null)[];
  status: string;
  version: number;
  openAssignedCount: number;
  email?: string;
};

export type StatusCounts = Record<ComplaintStatus, number>;

export type StudentDashboardData = {
  asOf: string;
  statusCounts: StatusCounts;
  total: number;
  open: number;
  resolved: number;
  closed: number;
  rejected: number;
  recentComplaints: ComplaintSummary[];
  latestActivity: ActivityItem[];
};

export type StaffDashboardData = {
  asOf: string;
  statusCounts: StatusCounts;
  total: number;
  assignedPending: number;
  inProgress: number;
  overdueResponse: number;
  overdueResolution: number;
  overdueAny: number;
  queue: ComplaintSummary[];
};

export type AdminDashboardData = {
  asOf: string;
  statusCounts: StatusCounts;
  total: number;
  open: number;
  resolved: number;
  closed: number;
  rejected: number;
  unassigned: number;
  overdueResponse: number;
  overdueResolution: number;
  overdueAny: number;
  staffWorkload: StaffWorkloadItem[];
  recentComplaints: ComplaintSummary[];
};
