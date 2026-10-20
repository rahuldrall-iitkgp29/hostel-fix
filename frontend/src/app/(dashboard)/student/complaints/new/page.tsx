"use client";

import { AuthGuard } from "@/features/auth/components/auth-guard";
import { useAuth } from "@/features/auth/context/auth-context";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { CreateComplaintForm } from "@/features/complaints/components/create-complaint-form";

function CreateComplaintContent() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        role: "STUDENT",
        roomLabel: user.roomId ?? undefined,
      }}
      onLogout={logout}
    >
      <div className="mx-auto max-w-3xl space-y-8">
        <PageHeader
          eyebrow="Student Report"
          title="Report a Maintenance Issue"
          description="Submit a repair request for your room, your block shared areas, or common hostel facilities."
          breadcrumbs={[
            { label: "Dashboard", href: "/student/dashboard" },
            { label: "My Complaints", href: "/student/complaints" },
            { label: "New Report" },
          ]}
        />

        <CreateComplaintForm />
      </div>
    </AppShell>
  );
}

export default function NewComplaintPage() {
  return (
    <AuthGuard allowedRoles={["STUDENT"]}>
      <CreateComplaintContent />
    </AuthGuard>
  );
}
