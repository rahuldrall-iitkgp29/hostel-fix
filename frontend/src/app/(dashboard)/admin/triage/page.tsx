'use client';

import { AuthGuard } from '@/features/auth/components/auth-guard';
import { useAuth } from '@/features/auth/context/auth-context';
import { AppShell } from '@/components/layout/app-shell';
import { PageHeader } from '@/components/layout/page-header';
import { ComplaintList } from '@/features/complaints/components/complaint-list';

function AdminTriageContent() {
  const { user, logout } = useAuth();
  if (!user) return null;

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
          eyebrow="Triage Queue"
          title="Review Incoming Reports"
          description="Review newly submitted and reopened complaints. Validate urgency, verify location, or reject out-of-scope issues."
          breadcrumbs={[
            { label: 'Dashboard', href: '/admin/dashboard' },
            { label: 'Triage & Review' },
          ]}
        />

        <ComplaintList
          scopeTitle="Complaints requiring triage"
          initialStatus="SUBMITTED"
          initialSort="createdAt:asc"
        />
      </div>
    </AppShell>
  );
}

export default function AdminTriagePage() {
  return (
    <AuthGuard allowedRoles={['ADMIN']}>
      <AdminTriageContent />
    </AuthGuard>
  );
}
