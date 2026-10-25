'use client';

import { AuthGuard } from '@/features/auth/components/auth-guard';
import { useAuth } from '@/features/auth/context/auth-context';
import { AppShell } from '@/components/layout/app-shell';
import { PageHeader } from '@/components/layout/page-header';
import { ButtonLink } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { ComplaintList } from '@/features/complaints/components/complaint-list';

function StudentComplaintsContent() {
  const { user, logout } = useAuth();
  if (!user) return null;

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
          eyebrow="Student Reports"
          title="My Complaints"
          description="View, search, and track all maintenance requests submitted for your room and common areas."
          actions={
            <ButtonLink href="/student/complaints/new" variant="primary">
              <PlusCircle className="size-4" aria-hidden="true" /> Report an
              issue
            </ButtonLink>
          }
          breadcrumbs={[
            { label: 'Dashboard', href: '/student/dashboard' },
            { label: 'My Complaints' },
          ]}
        />

        <ComplaintList scopeTitle="My complaints" />
      </div>
    </AppShell>
  );
}

export default function StudentComplaintsPage() {
  return (
    <AuthGuard allowedRoles={['STUDENT']}>
      <StudentComplaintsContent />
    </AuthGuard>
  );
}
