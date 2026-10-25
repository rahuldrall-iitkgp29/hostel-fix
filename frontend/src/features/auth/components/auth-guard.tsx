'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../context/auth-context';
import type { UserRole } from '../types';
import { StatePanel } from '@/components/feedback/state-panel';
import { ButtonLink } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Container } from '@/components/layout/container';

export type AuthGuardProps = {
  children: ReactNode;
  allowedRoles?: UserRole[];
};

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      const returnTo = encodeURIComponent(pathname);
      router.replace(`/login?returnTo=${returnTo}`);
      return;
    }

    if (user.mustChangePassword && pathname !== '/change-password') {
      router.replace('/change-password');
    }
  }, [user, isLoading, pathname, router]);

  if (isLoading) {
    return (
      <Container className="py-12" aria-busy="true" role="status">
        <span className="sr-only">Checking authorization...</span>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-10 w-28" />
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </Container>
    );
  }

  if (!user) {
    return null;
  }

  if (user.mustChangePassword && pathname !== '/change-password') {
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const authorizedPath = `/${user.role.toLowerCase()}/dashboard`;
    return (
      <Container className="py-16">
        <StatePanel
          kind="error"
          title="Access restricted"
          action={
            <ButtonLink href={authorizedPath} variant="primary">
              Go to your dashboard{' '}
              <ArrowRight className="size-4" aria-hidden="true" />
            </ButtonLink>
          }
        >
          <div className="space-y-2">
            <p>
              This section is reserved for{' '}
              {allowedRoles.map((r) => r.toLowerCase()).join(' or ')} accounts.
            </p>
            <p className="text-xs text-muted">
              You are signed in as a <strong>{user.role}</strong> ({user.email}
              ).
            </p>
          </div>
        </StatePanel>
      </Container>
    );
  }

  return <>{children}</>;
}
