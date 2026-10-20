"use client";

import { useAuth } from "@/features/auth/context/auth-context";
import { Container, PageHeading } from "@/components/layout/container";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { ShieldAlert, LogOut } from "lucide-react";

export default function ChangePasswordPage() {
  const { user, logout } = useAuth();

  return (
    <Container className="py-12 sm:py-20">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 text-center sm:text-left">
          <PageHeading
            eyebrow="Security requirement"
            title="Update your password"
          >
            {user?.name ? `Hello ${user.name}. ` : ""}
            Your account requires a new password before you can continue to your hostel workspace.
          </PageHeading>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-xs sm:p-8">
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-warning/20 bg-warning/10 p-4 text-xs leading-5 text-warning">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              Your current password cannot be reused. Choose a strong password of at least 12 characters.
            </p>
          </div>

          <ChangePasswordForm />

          <div className="mt-6 border-t border-line pt-4 text-center">
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-muted hover:text-danger"
            >
              <LogOut className="size-3.5" /> Cancel and sign out
            </button>
          </div>
        </div>
      </div>
    </Container>
  );
}
