"use client";

import { AuthGuard } from "@/features/auth/components/auth-guard";
import { useAuth } from "@/features/auth/context/auth-context";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ComplaintList } from "@/features/complaints/components/complaint-list";

function AdminAssignmentContent() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        role: "ADMIN",
      }}
      onLogout={logout}
    >
      <div className="space-y-8">
        <PageHeader
          eyebrow="Staff Allocation"
          title="Complaint Assignments"
          description="Assign eligible maintenance staff based on category specialization and existing workload balance."
          breadcrumbs={[
            { label: "Dashboard", href: "/admin/dashboard" },
            { label: "Assignments" },
          ]}
        />

        <ComplaintList
          scopeTitle="Complaints awaiting assignment"
          initialStatus="TRIAGED"
          initialSort="createdAt:asc"
        />
      </div>
    </AppShell>
  );
}

export default function AdminAssignmentPage() {
  return (
    <AuthGuard allowedRoles={["ADMIN"]}>
      <AdminAssignmentContent />
    </AuthGuard>
  );
}
