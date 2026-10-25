'use client';

import { use } from 'react';
import { AuthGuard } from '@/features/auth/components/auth-guard';
import { useAuth } from '@/features/auth/context/auth-context';
import { AppShell } from '@/components/layout/app-shell';
import { ComplaintDetailView } from '@/features/complaints/components/complaint-detail-view';

function ComplaintContent({ complaintId }: { complaintId: string }) {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        role: user.role,
        roomLabel: user.roomId ?? undefined,
      }}
      onLogout={logout}
    >
      <div className="mx-auto max-w-5xl">
        <ComplaintDetailView complaintId={complaintId} />
      </div>
    </AppShell>
  );
}

export default function ComplaintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);

  return (
    <AuthGuard>
      <ComplaintContent complaintId={resolvedParams.id} />
    </AuthGuard>
  );
}
