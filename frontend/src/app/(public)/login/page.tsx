import { Suspense } from "react";
import type { Metadata } from "next";
import { AccountEntry } from "@/features/auth/components/account-entry";
import { Skeleton } from "@/components/ui/skeleton";
import { Container } from "@/components/layout/container";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

function LoginLoading() {
  return (
    <Container className="py-10 sm:py-16">
      <Skeleton className="h-6 w-32 mb-8" />
      <div className="grid gap-10 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    </Container>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <AccountEntry mode="login" />
    </Suspense>
  );
}
