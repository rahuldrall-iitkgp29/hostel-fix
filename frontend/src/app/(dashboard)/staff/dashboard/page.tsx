'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Wrench,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Calendar,
  ArrowRight,
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
import { getStaffDashboard } from '@/lib/api/complaints';
import { getApiErrorMessage } from '@/lib/api/errors';
import { StaffDashboardHistory } from '@/features/complaints/components/dashboard-history';
import type {
  StaffDashboardData,
  ComplaintSummary,
} from '@/features/complaints/types';

function StaffDashboardContent() {
  const { user, logout, apiClient } = useAuth();
  const [data, setData] = useState<StaffDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    getStaffDashboard(apiClient)
      .then((res) => {
        if (active) {
          setData(res);
          setError(null);
          setLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setError(
            getApiErrorMessage(
              error,
              'Unable to load staff dashboard. Please check your connection.'
            )
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [apiClient, refreshKey]);

  if (!user) return null;

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
        role: 'STAFF',
      }}
      onLogout={logout}
    >
      <div className="space-y-8">
        <PageHeader
          eyebrow="Staff Queue"
          title={`Welcome, ${user.name.split(' ')[0]}`}
          description="View your assigned repairs, start work, record resolution notes, and communicate with students."
          actions={
            <ButtonLink href="/staff/queue" variant="primary">
              <Wrench className="size-4" aria-hidden="true" /> Open full queue
            </ButtonLink>
          }
          breadcrumbs={[{ label: 'Staff Dashboard' }]}
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
            <StaffDashboardHistory data={data} />
            {/* Workload Cards with live counts */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Assigned Pending
                  </p>
                  <p className="text-2xl font-bold tracking-tight text-ink mt-1">
                    {data.assignedPending}
                  </p>
                </div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <Wrench className="size-5" />
                </span>
              </Card>

              <Card className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    In Progress
                  </p>
                  <p className="text-2xl font-bold tracking-tight text-ink mt-1">
                    {data.inProgress}
                  </p>
                </div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-warning-soft text-warning">
                  <Clock className="size-5" />
                </span>
              </Card>

              <Card className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Resolved (Total)
                  </p>
                  <p className="text-2xl font-bold tracking-tight text-ink mt-1">
                    {data.statusCounts.RESOLVED + data.statusCounts.CLOSED}
                  </p>
                </div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <CheckCircle2 className="size-5" />
                </span>
              </Card>

              <Card className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Overdue
                  </p>
                  <p className="text-2xl font-bold tracking-tight text-danger mt-1">
                    {data.overdueAny}
                  </p>
                </div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
                  <AlertTriangle className="size-5" />
                </span>
              </Card>
            </div>

            {/* Active Queue */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold tracking-tight text-ink">
                  Priority Work Orders
                </h2>
                <Link
                  href="/staff/queue"
                  className="text-xs font-semibold text-brand hover:underline"
                >
                  View full queue ({data.total})
                </Link>
              </div>

              {data.queue.length === 0 ? (
                <StatePanel
                  kind="empty"
                  title="No active repairs in your queue"
                  action={
                    <ButtonLink href="/staff/queue" variant="secondary">
                      Check resolved history
                    </ButtonLink>
                  }
                >
                  <p>
                    When complaints matching your categories are assigned to you
                    by administrators, they will appear here in work queue
                    order.
                  </p>
                </StatePanel>
              ) : (
                <div className="space-y-3">
                  {data.queue.map((c) => (
                    <Link
                      key={c.id}
                      href={`/complaints/${c.id}`}
                      className="group block rounded-2xl border border-line bg-surface p-5 transition-all hover:border-brand hover:shadow-xs"
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
                            {c.category && (
                              <span>Category: {c.category.name}</span>
                            )}
                            <span className="flex items-center gap-1">
                              <Calendar className="size-3.5" />
                              {new Date(c.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 text-xs font-semibold text-muted group-hover:text-brand">
                          <span>Open task</span>
                          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function StaffDashboardPage() {
  return (
    <AuthGuard allowedRoles={['STAFF']}>
      <StaffDashboardContent />
    </AuthGuard>
  );
}
