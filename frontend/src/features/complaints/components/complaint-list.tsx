'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Building2,
  Calendar,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '@/features/auth/context/auth-context';
import { listComplaints } from '@/lib/api/complaints';
import type { ComplaintSummary } from '../types';
import { StatusBadge } from './status-badge';
import { PriorityBadge } from './priority-badge';
import { StatePanel } from '@/components/feedback/state-panel';
import { Skeleton } from '@/components/ui/skeleton';

export type ComplaintListProps = {
  initialStatus?: string;
  initialSort?: string;
  scopeTitle?: string;
  fixedFilters?: Record<string, string | number | boolean>;
};

export function ComplaintList({
  initialStatus,
  initialSort = 'createdAt:desc',
  scopeTitle = 'Complaints',
  fixedFilters = {},
}: ComplaintListProps) {
  const { apiClient } = useAuth();
  const [complaints, setComplaints] = useState<ComplaintSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>(initialStatus || '');
  const [priority, setPriority] = useState<string>('');
  const [sort, setSort] = useState<string>(initialSort);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const query: Record<string, string | number | boolean> = {
      page,
      limit: 10,
      sort,
      ...fixedFilters,
    };

    if (search.trim().length >= 2) query.q = search.trim();
    if (status) query.status = status;
    if (priority) query.priority = priority;

    listComplaints(apiClient, query)
      .then((res) => {
        if (active) {
          setComplaints(res.data);
          setTotalPages(res.meta.totalPages || 1);
          setTotalCount(res.meta.total || 0);
          setError(null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError('Failed to load complaints. Please check your connection.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [
    apiClient,
    page,
    sort,
    search,
    status,
    priority,
    fixedFilters,
    refreshKey,
  ]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setLoading(true);
    setRefreshKey((k) => k + 1);
  };

  const formatLocation = (c: ComplaintSummary) => {
    if (c.location.type === 'ROOM') {
      return `Room ${c.location.roomLabel || 'Assigned'}`;
    }
    if (c.location.type === 'BLOCK_COMMON') {
      return `${c.location.blockName || 'Block'}: ${c.location.areaLabel}`;
    }
    return c.location.areaLabel || 'Hostel Common Area';
  };

  return (
    <div className="space-y-6">
      {/* Filters Header */}
      <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-col gap-4 sm:flex-row sm:items-center"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted" />
            <input
              type="text"
              placeholder="Search title, description, or reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-4 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="min-h-11 rounded-xl border border-line bg-surface px-3 text-xs font-semibold text-ink"
              aria-label="Filter by status"
            >
              <option value="">All Statuses</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="TRIAGED">Triaged</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
              <option value="REOPENED">Reopened</option>
              <option value="REJECTED">Rejected</option>
            </select>

            <select
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                setPage(1);
              }}
              className="min-h-11 rounded-xl border border-line bg-surface px-3 text-xs font-semibold text-ink"
              aria-label="Filter by priority"
            >
              <option value="">All Priorities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>

            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              className="min-h-11 rounded-xl border border-line bg-surface px-3 text-xs font-semibold text-ink"
              aria-label="Sort complaints"
            >
              <option value="createdAt:desc">Newest first</option>
              <option value="createdAt:asc">Oldest first</option>
              <option value="priority:desc">Highest priority</option>
              <option value="resolutionDueAt:asc">
                Resolution due soonest
              </option>
              <option value="workQueue">Work Queue order</option>
            </select>
          </div>
        </form>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      ) : error ? (
        <StatePanel kind="error" title="Unable to load reports">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setRefreshKey((k) => k + 1);
            }}
            className="mt-3 text-xs font-semibold text-brand underline underline-offset-2"
          >
            Retry
          </button>
        </StatePanel>
      ) : complaints.length === 0 ? (
        <StatePanel
          kind="empty"
          title={`No ${scopeTitle.toLowerCase()} match your criteria`}
        >
          <p>
            Try adjusting your search terms or filters to find what you are
            looking for.
          </p>
        </StatePanel>
      ) : (
        <div className="space-y-3">
          {complaints.map((c) => (
            <Link
              key={c.id}
              href={`/complaints/${c.id}`}
              className="group block rounded-2xl border border-line bg-surface p-4 sm:p-5 transition-all hover:border-brand hover:shadow-xs"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-muted">
                      #{c.reference}
                    </span>
                    <StatusBadge status={c.status} />
                    <PriorityBadge priority={c.priority} />
                    {c.isResolutionOverdue && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">
                        <AlertTriangle className="size-3" /> Overdue
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-semibold text-ink group-hover:text-brand transition-colors">
                    {c.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
                    <span className="flex items-center gap-1">
                      <Building2 className="size-3.5" />
                      {formatLocation(c)}
                    </span>
                    {c.category && <span>Category: {c.category.name}</span>}
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3.5" />
                      {new Date(c.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 text-xs font-semibold text-muted group-hover:text-brand">
                  <span>View details</span>
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-line pt-4 text-xs text-muted">
          <span>
            Showing page {page} of {totalPages} ({totalCount} total)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-line px-3 font-semibold disabled:opacity-40"
            >
              <ChevronLeft className="size-3.5" /> Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-line px-3 font-semibold disabled:opacity-40"
            >
              Next <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
