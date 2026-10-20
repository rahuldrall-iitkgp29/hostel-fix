"use client";

import { AuthGuard } from "@/features/auth/components/auth-guard";
import { useAuth } from "@/features/auth/context/auth-context";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ComplaintList } from "@/features/complaints/components/complaint-list";

function StaffQueueContent() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        role: "STAFF",
      }}
      onLogout={logout}
    >
      <div className="space-y-8">
        <PageHeader
          eyebrow="Staff Workload"
          title="Assigned Work Orders"
          description="Review tasks assigned to you sorted by SLA urgency and priority. Update progress and mark resolved."
          breadcrumbs={[
            { label: "Dashboard", href: "/staff/dashboard" },
            { label: "Work Queue" },
          ]}
        />

        <ComplaintList scopeTitle="Assigned repairs" initialSort="workQueue" />
      </div>
    </AppShell>
  );
}

export default function StaffQueuePage() {
  return (
    <AuthGuard allowedRoles={["STAFF"]}>
      <StaffQueueContent />
    </AuthGuard>
  );
}
