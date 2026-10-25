'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  UsersRound,
  AlertTriangle,
  CheckSquare,
  Building2,
} from 'lucide-react';
import { AuthGuard } from '@/features/auth/components/auth-guard';
import { useAuth } from '@/features/auth/context/auth-context';
import { AppShell } from '@/components/layout/app-shell';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { StatePanel } from '@/components/feedback/state-panel';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/features/complaints/components/status-badge';
import { PriorityBadge } from '@/features/complaints/components/priority-badge';
import { getAdminDashboard } from '@/lib/api/complaints';
import type {
  AdminDashboardData,
  ComplaintSummary,
} from '@/features/complaints/types';

function AdminDashboardContent() {
  const { user, logout, apiClient } = useAuth();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedHostelId, setSelectedHostelId] = useState<string>('');

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const filters = selectedHostelId
      ? { hostelId: selectedHostelId }
      : undefined;
    getAdminDashboard(apiClient, filters)
      .then((res) => {
        if (active) {
          setData(res);
          setError(null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(
            'Unable to load administrator dashboard. Please check your connection.'
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [apiClient, selectedHostelId, refreshKey]);

  if (!user) return null;

  const adminHostelIds = (user.adminHostelIds || []).filter(
    Boolean
  ) as string[];

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
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        role: 'ADMIN',
      }}
      onLogout={logout}
    >
      <div className="space-y-8">
        <PageHeader
          eyebrow="Hostel Operations"
          title="Administrator Portal"
          description="Review incoming student complaints, assign eligible maintenance staff, track SLAs, and oversee hostel repairs."
          actions={
            <div className="flex flex-wrap items-center gap-3">
              {adminHostelIds.length > 1 && (
                <select
                  value={selectedHostelId}
                  onChange={(e) => setSelectedHostelId(e.target.value)}
                  className="min-h-11 rounded-xl border border-line bg-surface px-3 text-xs font-semibold text-ink"
                  aria-label="Filter by assigned hostel"
                >
                  <option value="">All Scoped Hostels</option>
                  {adminHostelIds.map((hId) => (
                    <option key={hId} value={hId}>
                      Hostel {hId.slice(-6)}
                    </option>
                  ))}
                </select>
              )}
              <ButtonLink href="/admin/triage" variant="primary">
                <CheckSquare className="size-4" aria-hidden="true" /> Open
                triage queue
              </ButtonLink>
            </div>
          }
          breadcrumbs={[{ label: 'Admin Operations' }]}
        />

        {loading ? (
          <div className="space-y-6" aria-busy="true">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
            </div>
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        ) : error ? (
          <StatePanel kind="error" title="Dashboard unavailable">
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
        ) : data ? (
          <>
            {/* Operational Overview Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Needs Triage
                  </p>
                  <p className="text-2xl font-bold tracking-tight text-ink mt-1">
                    {data.statusCounts.SUBMITTED + data.statusCounts.REOPENED}
                  </p>
                </div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <CheckSquare className="size-5" />
                </span>
              </Card>

              <Card className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Unassigned Work
                  </p>
                  <p className="text-2xl font-bold tracking-tight text-ink mt-1">
                    {data.unassigned}
                  </p>
                </div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-warning-soft text-warning">
                  <UsersRound className="size-5" />
                </span>
              </Card>

              <Card className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Overdue SLA Alerts
                  </p>
                  <p className="text-2xl font-bold tracking-tight text-danger mt-1">
                    {data.overdueAny}
                  </p>
                </div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
                  <AlertTriangle className="size-5" />
                </span>
              </Card>

              <Card className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Active Open
                  </p>
                  <p className="text-2xl font-bold tracking-tight text-ink mt-1">
                    {data.open}
                  </p>
                </div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-canvas text-muted">
                  <ShieldCheck className="size-5" />
                </span>
              </Card>
            </div>

            {/* Main Admin Grid: Triage Queue & Staff Workload */}
            <div className="grid gap-8 lg:grid-cols-3">
              {/* Triage / Recent Complaints (2 cols) */}
              <div className="space-y-4 lg:col-span-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold tracking-tight text-ink">
                    Complaints Awaiting Attention
                  </h2>
                  <Link
                    href="/admin/triage"
                    className="text-xs font-semibold text-brand hover:underline"
                  >
                    View triage queue
                  </Link>
                </div>

                {data.recentComplaints.length === 0 ? (
                  <StatePanel kind="empty" title="All complaints processed">
                    <p>
                      There are no unaddressed or recently reported complaints
                      in your scoped hostels.
                    </p>
                  </StatePanel>
                ) : (
                  <div className="space-y-3">
                    {data.recentComplaints.map((c) => (
                      <Link
                        key={c.id}
                        href={`/complaints/${c.id}`}
                        className="group block rounded-2xl border border-line bg-surface p-4 transition-all hover:border-brand hover:shadow-xs"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
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
                            <h3 className="text-sm font-semibold text-ink group-hover:text-brand transition-colors">
                              {c.title}
                            </h3>
                            <p className="flex items-center gap-2 text-xs text-muted">
                              <Building2 className="size-3.5" />
                              {formatLocation(c)}
                            </p>
                          </div>
                          <span className="text-xs text-muted">
                            {new Date(c.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Staff Workload Table (1 col) */}
              <div className="space-y-4 lg:col-span-1">
                <h2 className="text-lg font-semibold tracking-tight text-ink flex items-center gap-2">
                  <UsersRound className="size-4 text-brand" /> Staff Workload
                </h2>

                {data.staffWorkload.length === 0 ? (
                  <Card className="p-6 text-center text-xs text-muted">
                    No active staff found in scoped hostels.
                  </Card>
                ) : (
                  <div className="rounded-2xl border border-line bg-surface p-4 divide-y divide-line">
                    {data.staffWorkload.map((sw) => (
                      <div
                        key={sw.staffId}
                        className="py-3 first:pt-0 last:pb-0 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-ink">
                            {sw.name}
                          </span>
                          <span className="font-bold text-brand">
                            {sw.openAssigned} active
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
                          <span>Pending: {sw.assignedPending}</span>
                          <span>In progress: {sw.inProgress}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function AdminDashboardPage() {
  return (
    <AuthGuard allowedRoles={['ADMIN']}>
      <AdminDashboardContent />
    </AuthGuard>
  );
}
