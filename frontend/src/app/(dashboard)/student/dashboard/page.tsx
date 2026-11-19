'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  PlusCircle,
  ClipboardList,
  Clock,
  CheckCircle2,
  Building2,
  Activity,
  History,
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
import { getStudentDashboard } from '@/lib/api/complaints';
import { getApiErrorMessage } from '@/lib/api/errors';
import type {
  StudentDashboardData,
  ComplaintSummary,
} from '@/features/complaints/types';

function StudentDashboardContent() {
  const { user, logout, apiClient } = useAuth();
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    getStudentDashboard(apiClient)
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
              'Unable to load dashboard data. Please check your connection.'
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
        role: 'STUDENT',
        roomLabel: user.roomId ?? undefined,
      }}
      onLogout={logout}
    >
      <div className="space-y-8">
        <PageHeader
          eyebrow="Student Workspace"
          title={`Welcome back, ${user.name.split(' ')[0]}`}
          description="Track your room and common-area maintenance requests, check repair progress, and confirm completed work."
          actions={
            <ButtonLink href="/student/complaints/new" variant="primary">
              <PlusCircle className="size-4" aria-hidden="true" /> Report an
              issue
            </ButtonLink>
          }
          breadcrumbs={[{ label: 'Student Dashboard' }]}
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
            {/* Quick Summary Cards with real counts */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Active Open
                  </p>
                  <p className="text-2xl font-bold tracking-tight text-ink mt-1">
                    {data.open}
                  </p>
                </div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <ClipboardList className="size-5" />
                </span>
              </Card>

              <Card className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    In Progress
                  </p>
                  <p className="text-2xl font-bold tracking-tight text-ink mt-1">
                    {data.statusCounts.IN_PROGRESS}
                  </p>
                </div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-warning-soft text-warning">
                  <Clock className="size-5" />
                </span>
              </Card>

              <Card className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Resolved (Awaiting confirmation)
                  </p>
                  <p className="text-2xl font-bold tracking-tight text-ink mt-1">
                    {data.resolved}
                  </p>
                </div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <CheckCircle2 className="size-5" />
                </span>
              </Card>

              <Card className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Closed / Completed
                  </p>
                  <p className="text-2xl font-bold tracking-tight text-ink mt-1">
                    {data.closed}
                  </p>
                </div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-canvas text-muted">
                  <History className="size-5" />
                </span>
              </Card>
            </div>

            {/* Recent complaints & activity grid */}
            <div className="grid gap-8 lg:grid-cols-3">
              {/* Recent Complaints (2 cols) */}
              <div className="space-y-4 lg:col-span-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold tracking-tight text-ink">
                    Recent Complaints
                  </h2>
                  <Link
                    href="/student/complaints"
                    className="text-xs font-semibold text-brand hover:underline"
                  >
                    View all reports ({data.total})
                  </Link>
                </div>

                {data.recentComplaints.length === 0 ? (
                  <StatePanel
                    kind="empty"
                    title="No complaints reported yet"
                    action={
                      <ButtonLink
                        href="/student/complaints/new"
                        variant="secondary"
                      >
                        <PlusCircle className="size-4" aria-hidden="true" />{' '}
                        Submit your first report
                      </ButtonLink>
                    }
                  >
                    <p>
                      When you submit a maintenance issue for your room or a
                      common hostel area, it will appear here so you can track
                      its progress.
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
                            {new Date(c.createdAt).toLocaleDateString(
                              undefined,
                              {
                                month: 'short',
                                day: 'numeric',
                              }
                            )}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Latest Activity (1 col) */}
              <div className="space-y-4 lg:col-span-1">
                <h2 className="text-lg font-semibold tracking-tight text-ink flex items-center gap-2">
                  <Activity className="size-4 text-brand" /> Timeline
                </h2>

                {data.latestActivity.length === 0 ? (
                  <Card className="p-6 text-center text-xs text-muted">
                    No recent activity on your complaints.
                  </Card>
                ) : (
                  <div className="rounded-2xl border border-line bg-surface p-4 divide-y divide-line">
                    {data.latestActivity.map((act) => (
                      <div
                        key={act.id}
                        className="py-3 first:pt-0 last:pb-0 text-xs"
                      >
                        <div className="flex items-center justify-between text-muted">
                          <span className="font-semibold text-ink">
                            {act.type.replace(/_/g, ' ')}
                          </span>
                          <span>
                            {new Date(act.occurredAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        {act.actor && (
                          <p className="mt-0.5 text-muted">
                            By {act.actor.name || 'System'} ({act.actor.role})
                          </p>
                        )}
                        {act.note && (
                          <p className="mt-1 text-ink bg-canvas/70 p-2 rounded-lg">
                            {act.note}
                          </p>
                        )}
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

export default function StudentDashboardPage() {
  return (
    <AuthGuard allowedRoles={['STUDENT']}>
      <StudentDashboardContent />
    </AuthGuard>
  );
}
