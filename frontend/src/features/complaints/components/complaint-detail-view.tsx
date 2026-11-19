'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Building2,
  AlertTriangle,
  MessageSquare,
  Activity as ActivityIcon,
  CheckCircle2,
  RotateCcw,
  Send,
  Star,
  UserCheck,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/features/auth/context/auth-context';
import {
  getComplaintDetail,
  getCommentsPage,
  addComment,
  getActivitiesPage,
  transitionComplaint,
  assignComplaint,
  overridePriority,
  reopenComplaint,
  submitFeedback,
  getAdminStaff,
} from '@/lib/api/complaints';
import type {
  ComplaintDetail,
  CommentItem,
  ActivityItem,
  AdminStaffItem,
  Priority,
  RejectionCode,
} from '../types';
import { StatusBadge } from './status-badge';
import { PriorityBadge } from './priority-badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { TextareaField } from '@/components/ui/textarea-field';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { StatePanel } from '@/components/feedback/state-panel';
import { PrivatePhoto } from './private-photo';
import { EditComplaintForm } from './edit-complaint-form';
import { PaginationControls } from '@/components/ui/pagination';
import { ApiError } from '@/lib/api/errors';

export function ComplaintDetailView({ complaintId }: { complaintId: string }) {
  const router = useRouter();
  const { apiClient } = useAuth();

  const [complaint, setComplaint] = useState<ComplaintDetail | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [commentPage, setCommentPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
  const [commentPages, setCommentPages] = useState(1);
  const [activityPages, setActivityPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New comment
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Dialog modals
  const [activeDialog, setActiveDialog] = useState<
    | 'edit'
    | 'triage'
    | 'reject'
    | 'startWork'
    | 'resolve'
    | 'close'
    | 'assign'
    | 'priority'
    | 'reopen'
    | 'feedback'
    | null
  >(null);

  // Action states
  const [actionNote, setActionNote] = useState('');
  const [rejectionCode, setRejectionCode] =
    useState<RejectionCode>('OUT_OF_SCOPE');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [eligibleStaff, setEligibleStaff] = useState<AdminStaffItem[]>([]);
  const [newPriority, setNewPriority] = useState<Priority>('HIGH');
  const [feedbackRating, setFeedbackRating] = useState<number>(5);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const reloadData = () => {
    setRefreshKey((k) => k + 1);
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      getComplaintDetail(apiClient, complaintId),
      getCommentsPage(apiClient, complaintId, commentPage),
      getActivitiesPage(apiClient, complaintId, activityPage),
    ])
      .then(([detailRes, commentRes, activityRes]) => {
        if (active) {
          setComplaint(detailRes);
          setComments(commentRes.data);
          setCommentPages(commentRes.meta.totalPages);
          setActivities(activityRes.data);
          setActivityPages(activityRes.meta.totalPages);
          setError(null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(
            'Unable to load complaint details. Please check your connection.'
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [apiClient, complaintId, refreshKey, commentPage, activityPage]);

  // Load eligible staff if admin opens assign dialog
  const openAssignModal = async () => {
    if (!complaint) return;
    setActiveDialog('assign');
    setActionError(null);
    setActionNote('');
    try {
      const staffList = await getAdminStaff(apiClient, {
        hostelId: complaint.location.hostelId,
        eligibleForComplaintId: complaint.id,
      });
      setEligibleStaff(staffList);
      if (staffList.length > 0 && staffList[0]) {
        setSelectedStaffId(staffList[0].id);
      }
    } catch {
      setEligibleStaff([]);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complaint || !commentText.trim()) return;

    setSubmittingComment(true);
    try {
      const newC = await addComment(apiClient, complaint.id, {
        expectedVersion: complaint.version,
        body: commentText.trim(),
      });
      void newC;
      setCommentPage(1);
      reloadData();
      setCommentText('');
      // Increment version locally
      setComplaint({ ...complaint, version: complaint.version + 1 });
      toast.success('Comment posted');
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error('Complaint was modified elsewhere. Reloading...');
        reloadData();
      } else {
        toast.error('Failed to post comment.');
      }
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleExecuteAction = async () => {
    if (!complaint) return;
    setSubmittingAction(true);
    setActionError(null);

    try {
      let updated: ComplaintDetail;

      if (activeDialog === 'triage') {
        updated = await transitionComplaint(apiClient, complaint.id, {
          expectedVersion: complaint.version,
          toStatus: 'TRIAGED',
          note: actionNote.trim(),
        });
      } else if (activeDialog === 'reject') {
        updated = await transitionComplaint(apiClient, complaint.id, {
          expectedVersion: complaint.version,
          toStatus: 'REJECTED',
          rejectionCode,
          note: actionNote.trim(),
        });
      } else if (activeDialog === 'startWork') {
        updated = await transitionComplaint(apiClient, complaint.id, {
          expectedVersion: complaint.version,
          toStatus: 'IN_PROGRESS',
          note:
            actionNote.trim() ||
            'Maintenance technician began on-site repair work.',
        });
      } else if (activeDialog === 'resolve') {
        updated = await transitionComplaint(apiClient, complaint.id, {
          expectedVersion: complaint.version,
          toStatus: 'RESOLVED',
          resolutionNote: actionNote.trim(),
        });
      } else if (activeDialog === 'close') {
        updated = await transitionComplaint(apiClient, complaint.id, {
          expectedVersion: complaint.version,
          toStatus: 'CLOSED',
          note: actionNote.trim() || 'Confirmed and closed.',
        });
      } else if (activeDialog === 'assign') {
        updated = await assignComplaint(apiClient, complaint.id, {
          expectedVersion: complaint.version,
          staffId: selectedStaffId,
          note: actionNote.trim() || 'Assigned by hostel administration.',
        });
      } else if (activeDialog === 'priority') {
        updated = await overridePriority(apiClient, complaint.id, {
          expectedVersion: complaint.version,
          priority: newPriority,
          reason: actionNote.trim(),
        });
      } else if (activeDialog === 'reopen') {
        updated = await reopenComplaint(apiClient, complaint.id, {
          expectedVersion: complaint.version,
          reason: actionNote.trim(),
        });
      } else if (activeDialog === 'feedback') {
        await submitFeedback(apiClient, complaint.id, {
          expectedVersion: complaint.version,
          rating: feedbackRating,
          comment: actionNote.trim() || undefined,
        });
        toast.success('Thank you for your feedback!');
        setActiveDialog(null);
        reloadData();
        return;
      } else {
        return;
      }

      setComplaint(updated);
      toast.success('Action completed successfully');
      setActiveDialog(null);
      reloadData();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setActionError(
            'Complaint was modified in another session. Please reload and review the latest state.'
          );
          reloadData();
        } else {
          setActionError(err.message);
        }
      } else {
        setActionError(
          'Failed to complete action. Please check your connection.'
        );
      }
    } finally {
      setSubmittingAction(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (error || !complaint) {
    return (
      <StatePanel kind="error" title="Complaint not found">
        <p>
          {error ||
            'This complaint may have been deleted or is outside your access scope.'}
        </p>
        <Button
          variant="secondary"
          onClick={() => router.back()}
          className="mt-4"
        >
          Go back
        </Button>
      </StatePanel>
    );
  }

  const formatLocation = (c: ComplaintDetail) => {
    if (c.location.type === 'ROOM') {
      return `Room ${c.location.roomLabel || 'Assigned'} (${c.location.hostelName || 'Hostel'})`;
    }
    if (c.location.type === 'BLOCK_COMMON') {
      return `${c.location.blockName || 'Block'}: ${c.location.areaLabel}`;
    }
    return `${c.location.hostelName || 'Hostel'}: ${c.location.areaLabel || 'Common Area'}`;
  };

  const allowedActions = complaint.allowedActions || [];

  return (
    <div className="space-y-8">
      {/* Header Card */}
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold text-muted">
                #{complaint.reference}
              </span>
              <StatusBadge status={complaint.status} />
              <PriorityBadge priority={complaint.priority} />
              {complaint.isResolutionOverdue && (
                <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                  <AlertTriangle className="size-3" /> SLA Overdue
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              {complaint.title}
            </h1>
            <p className="flex items-center gap-2 text-sm text-muted">
              <Building2 className="size-4 text-brand" />
              {formatLocation(complaint)}
            </p>
          </div>

          {/* Action buttons matching backend allowedActions */}
          <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0">
            {allowedActions.includes('EDIT') && (
              <Button type="button" onClick={() => setActiveDialog('edit')}>
                Edit complaint
              </Button>
            )}
            {allowedActions.includes('TRIAGE') && (
              <Button
                variant="primary"
                onClick={() => {
                  setActiveDialog('triage');
                  setActionNote('');
                  setActionError(null);
                }}
              >
                <CheckCircle2 className="size-4" /> Triage
              </Button>
            )}

            {allowedActions.includes('REJECT') && (
              <Button
                variant="secondary"
                onClick={() => {
                  setActiveDialog('reject');
                  setActionNote('');
                  setActionError(null);
                }}
              >
                <XCircle className="size-4 text-danger" /> Reject
              </Button>
            )}

            {(allowedActions.includes('ASSIGN') ||
              allowedActions.includes('REASSIGN')) && (
              <Button variant="primary" onClick={openAssignModal}>
                <UserCheck className="size-4" />
                {allowedActions.includes('REASSIGN')
                  ? 'Reassign Staff'
                  : 'Assign Staff'}
              </Button>
            )}

            {allowedActions.includes('CHANGE_PRIORITY') && (
              <Button
                variant="secondary"
                onClick={() => {
                  setActiveDialog('priority');
                  setActionNote('');
                  setActionError(null);
                }}
              >
                Change Priority
              </Button>
            )}

            {allowedActions.includes('START_WORK') && (
              <Button
                variant="primary"
                onClick={() => {
                  setActiveDialog('startWork');
                  setActionNote('');
                  setActionError(null);
                }}
              >
                <Wrench className="size-4" /> Start Work
              </Button>
            )}

            {allowedActions.includes('RESOLVE') && (
              <Button
                variant="primary"
                onClick={() => {
                  setActiveDialog('resolve');
                  setActionNote('');
                  setActionError(null);
                }}
              >
                <CheckCircle2 className="size-4" /> Mark Resolved
              </Button>
            )}

            {allowedActions.includes('CLOSE') && (
              <Button
                variant="primary"
                onClick={() => {
                  setActiveDialog('close');
                  setActionNote('');
                  setActionError(null);
                }}
              >
                <CheckCircle2 className="size-4" /> Confirm & Close
              </Button>
            )}

            {allowedActions.includes('REOPEN') && (
              <Button
                variant="secondary"
                onClick={() => {
                  setActiveDialog('reopen');
                  setActionNote('');
                  setActionError(null);
                }}
              >
                <RotateCcw className="size-4 text-warning" /> Reopen Report
              </Button>
            )}

            {allowedActions.includes('FEEDBACK') && (
              <Button
                variant="secondary"
                onClick={() => {
                  setActiveDialog('feedback');
                  setActionNote('');
                  setActionError(null);
                }}
              >
                <Star className="size-4 text-warning" /> Leave Feedback
              </Button>
            )}
          </div>
        </div>

        {/* Operational Metadata Bar */}
        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-4 text-xs text-muted sm:grid-cols-4">
          <div>
            <span className="block text-muted">Category</span>
            <span className="font-semibold text-ink">
              {complaint.category?.name || 'Uncategorized'}
            </span>
          </div>
          <div>
            <span className="block text-muted">Assignee</span>
            <span className="font-semibold text-ink">
              {complaint.assignee?.name || 'Unassigned'}
            </span>
          </div>
          <div>
            <span className="block text-muted">Reported On</span>
            <span className="font-semibold text-ink">
              {new Date(complaint.createdAt).toLocaleDateString()}
            </span>
          </div>
          <div>
            <span className="block text-muted">Cycle / Version</span>
            <span className="font-semibold text-ink">
              Cycle #{complaint.cycleNumber} (v{complaint.version})
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Description & Media vs Timeline & Comments */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left Column (2 cols) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Issue Description */}
          <Card className="space-y-4">
            <h2 className="text-base font-semibold text-ink">
              Report description
            </h2>
            <p className="whitespace-pre-line text-sm leading-7 text-ink">
              {complaint.description}
            </p>

            {/* Severity Indicators */}
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                Identified Indicators
              </p>
              <div className="flex flex-wrap gap-2">
                {complaint.indicators.safetyRisk && (
                  <span className="rounded-full bg-danger/10 px-3 py-1 text-xs font-medium text-danger">
                    Safety risk
                  </span>
                )}
                {complaint.indicators.essentialServiceOutage && (
                  <span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-medium text-warning">
                    Essential service outage
                  </span>
                )}
                {complaint.indicators.affectsMultipleRooms && (
                  <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand">
                    Affects multiple rooms
                  </span>
                )}
                {complaint.indicators.functionalityLoss && (
                  <span className="rounded-full bg-canvas border border-line px-3 py-1 text-xs font-medium text-ink">
                    Functionality loss
                  </span>
                )}
                {!Object.values(complaint.indicators).some(Boolean) && (
                  <span className="text-xs text-muted">
                    Standard routine issue
                  </span>
                )}
              </div>
            </div>

            {/* Resolution Note if resolved */}
            {complaint.resolutionNote && (
              <div className="mt-4 rounded-xl border border-brand/20 bg-brand-soft/40 p-4">
                <p className="text-xs font-semibold text-brand uppercase tracking-wider">
                  Resolution Note
                </p>
                <p className="mt-1 text-sm text-ink">
                  {complaint.resolutionNote}
                </p>
                {complaint.resolvedAt && (
                  <p className="mt-2 text-[11px] text-muted">
                    Resolved on{' '}
                    {new Date(complaint.resolvedAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </Card>

          {complaint.attachments.length > 0 && (
            <Card className="space-y-4">
              <h2 className="font-semibold">
                Attached Photos ({complaint.attachments.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-3">
                {complaint.attachments.map((attachment) => (
                  <PrivatePhoto key={attachment.id} attachment={attachment} />
                ))}
              </div>
            </Card>
          )}

          {/* Feedback Display if available */}
          {complaint.feedback && (
            <Card className="p-4 bg-warning-soft/40 border-warning/20">
              <div className="flex items-center gap-2">
                <Star className="size-4 text-warning fill-warning" />
                <span className="font-semibold text-sm text-ink">
                  Student Rating: {complaint.feedback.rating} / 5 Stars
                </span>
              </div>
              {complaint.feedback.comment && (
                <p className="mt-2 text-xs text-muted italic">
                  &ldquo;{complaint.feedback.comment}&rdquo;
                </p>
              )}
            </Card>
          )}

          {/* Public Comments Thread */}
          <Card className="space-y-6">
            <h2 className="text-base font-semibold text-ink flex items-center gap-2">
              <MessageSquare className="size-4 text-brand" /> Public Comments (
              {comments.length})
            </h2>

            {/* Comment Form */}
            {allowedActions.includes('COMMENT') && (
              <form onSubmit={handleAddComment} className="space-y-3">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Write a message, update, or question visible to student, staff, and admin..."
                  rows={3}
                  disabled={submittingComment}
                  className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    loading={submittingComment}
                    disabled={!commentText.trim()}
                    className="text-xs"
                  >
                    <Send className="size-3.5" /> Post comment
                  </Button>
                </div>
              </form>
            )}

            <PaginationControls
              label="Comments"
              page={commentPage}
              totalPages={commentPages}
              onPage={setCommentPage}
              disabled={submittingComment}
            />
            {/* Comments List */}
            {comments.length === 0 ? (
              <p className="text-center text-xs text-muted py-4 border-t border-line">
                No comments on this report yet.
              </p>
            ) : (
              <div className="space-y-4 border-t border-line pt-4 divide-y divide-line">
                {comments.map((cm) => (
                  <div key={cm.id} className="pt-4 first:pt-0 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink">
                          {cm.author.name || 'User'}
                        </span>
                        <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] text-muted font-medium border border-line">
                          {cm.author.role}
                        </span>
                      </div>
                      <span className="text-muted">
                        {new Date(cm.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-ink whitespace-pre-line">
                      {cm.body}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Activity Timeline */}
        <div className="space-y-6 lg:col-span-1">
          <Card className="space-y-4">
            <h2 className="text-base font-semibold text-ink flex items-center gap-2">
              <ActivityIcon className="size-4 text-brand" /> Activity Timeline
            </h2>

            <PaginationControls
              label="Activity"
              page={activityPage}
              totalPages={activityPages}
              onPage={setActivityPage}
            />
            {activities.length === 0 ? (
              <p className="text-xs text-muted">No activities recorded yet.</p>
            ) : (
              <div className="relative border-l border-line pl-4 ml-2 space-y-5 text-xs">
                {activities.map((act) => (
                  <div key={act.id} className="relative">
                    <span className="absolute -left-[21px] top-1 size-2 rounded-full bg-brand" />
                    <p className="font-semibold text-ink">
                      {act.type.replace(/_/g, ' ')}
                    </p>
                    {act.actor && (
                      <p className="text-muted text-[11px]">
                        By {act.actor.name} ({act.actor.role})
                      </p>
                    )}
                    {act.note && (
                      <p className="mt-1 text-ink bg-canvas p-2 rounded-lg text-xs">
                        {act.note}
                      </p>
                    )}
                    <span className="block mt-1 text-[10px] text-muted">
                      {new Date(act.occurredAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Action Dialogs */}
      <Dialog
        open={activeDialog !== null}
        onClose={() => setActiveDialog(null)}
        title={
          activeDialog === 'edit'
            ? 'Edit complaint'
            : activeDialog === 'triage'
              ? 'Triage Complaint'
              : activeDialog === 'reject'
                ? 'Reject Complaint'
                : activeDialog === 'startWork'
                  ? 'Start Work on Repair'
                  : activeDialog === 'resolve'
                    ? 'Record Repair Resolution'
                    : activeDialog === 'close'
                      ? 'Confirm and Close Report'
                      : activeDialog === 'assign'
                        ? 'Assign Maintenance Staff'
                        : activeDialog === 'priority'
                          ? 'Override Priority'
                          : activeDialog === 'reopen'
                            ? 'Reopen Complaint'
                            : activeDialog === 'feedback'
                              ? 'Rate Repair Experience'
                              : ''
        }
      >
        <div className="space-y-4">
          {activeDialog === 'edit' && (
            <EditComplaintForm
              key={complaint.version}
              complaint={complaint}
              onSaved={() => {
                setActiveDialog(null);
                reloadData();
              }}
              onConflict={() => {
                setActiveDialog(null);
                reloadData();
              }}
            />
          )}
          {actionError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/5 p-3 text-xs text-danger"
            >
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <p>{actionError}</p>
            </div>
          )}

          {activeDialog === 'reject' && (
            <SelectField
              id="rejection-code"
              label="Rejection Reason"
              value={rejectionCode}
              onChange={(e) =>
                setRejectionCode(e.target.value as RejectionCode)
              }
              options={[
                {
                  value: 'OUT_OF_SCOPE',
                  label: 'Out of scope / non-hostel responsibility',
                },
                {
                  value: 'INVALID_LOCATION',
                  label: 'Invalid room or area location',
                },
                {
                  value: 'INSUFFICIENT_INFORMATION',
                  label: 'Insufficient details provided',
                },
              ]}
            />
          )}

          {activeDialog === 'priority' && (
            <SelectField
              id="override-priority"
              label="New Priority"
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as Priority)}
              options={[
                { value: 'CRITICAL', label: 'Critical' },
                { value: 'HIGH', label: 'High' },
                { value: 'MEDIUM', label: 'Medium' },
                { value: 'LOW', label: 'Low' },
              ]}
            />
          )}

          {activeDialog === 'assign' && (
            <SelectField
              id="assignee-select"
              label="Select Eligible Staff"
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              placeholder={
                eligibleStaff.length === 0
                  ? 'No eligible staff found'
                  : undefined
              }
              options={eligibleStaff.map((s) => ({
                value: s.id,
                label: `${s.name} (${s.openAssignedCount} active tasks)`,
              }))}
            />
          )}

          {activeDialog === 'edit' ? null : activeDialog === 'feedback' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-ink mb-1">
                  How satisfied are you with this repair?
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setFeedbackRating(star)}
                      className="p-1 rounded-md hover:bg-canvas"
                      aria-label={`${star} Stars`}
                    >
                      <Star
                        className={`size-6 ${
                          star <= feedbackRating
                            ? 'text-warning fill-warning'
                            : 'text-muted'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <TextareaField
                id="feedback-comment"
                label="Comments (optional)"
                placeholder="Share any feedback about the technician or repair quality..."
                rows={3}
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
              />
            </div>
          ) : (
            <TextareaField
              id="action-note"
              label={
                activeDialog === 'resolve'
                  ? 'Resolution note (min 20 characters)'
                  : activeDialog === 'reopen'
                    ? 'Reason for reopening (min 20 characters)'
                    : 'Note / Explanation (min 10 characters)'
              }
              rows={3}
              placeholder={
                activeDialog === 'resolve'
                  ? 'Replaced ceiling fan capacitor and verified normal speed...'
                  : activeDialog === 'reopen'
                    ? 'The fan stopped working again after 2 hours...'
                    : 'Add notes explaining this decision...'
              }
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
            />
          )}

          {activeDialog !== 'edit' && (
            <div className="flex justify-end gap-3 pt-3 border-t border-line">
              <Button
                variant="secondary"
                onClick={() => setActiveDialog(null)}
                disabled={submittingAction}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleExecuteAction}
                loading={submittingAction}
              >
                Confirm
              </Button>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
