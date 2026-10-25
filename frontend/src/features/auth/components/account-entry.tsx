'use client';

import Link from 'next/link';
import { ArrowLeft, Check, ShieldCheck } from 'lucide-react';
import { Container, PageHeading } from '@/components/layout/container';
import { Badge } from '@/components/ui/badge';
import { LoginForm } from './login-form';
import { RegisterForm } from './register-form';

export function AccountEntry({ mode }: { mode: 'login' | 'register' }) {
  const register = mode === 'register';

  return (
    <Container className="py-10 sm:py-16">
      <Link
        href="/"
        className="mb-8 inline-flex min-h-11 items-center gap-2 rounded-md text-sm text-muted hover:text-brand"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to HostelFix
      </Link>

      <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <PageHeading
            eyebrow={
              register
                ? 'A better hostel starts with you'
                : 'Your hostel, connected'
            }
            title={register ? 'Your room. Your voice.' : 'Welcome back.'}
          >
            {register
              ? 'A student account brings your reports, updates, and repairs together in one place.'
              : 'Pick up where you left off. Your complaints, assigned work, and hostel updates belong in one place.'}
          </PageHeading>

          <ul className="mt-8 space-y-4">
            {(register
              ? [
                  'Register as a student in your hostel',
                  'Use your hostel’s enrollment code',
                  'Choose your assigned block and room',
                ]
              : [
                  'Students follow their own complaints',
                  'Staff keep track of assigned work',
                  'Admins oversee their assigned hostels',
                ]
            ).map((text) => (
              <li
                key={text}
                className="flex items-center gap-3 text-sm text-muted"
              >
                <Check
                  className="size-4 shrink-0 text-brand"
                  aria-hidden="true"
                />
                {text}
              </li>
            ))}
          </ul>

          <div className="mt-10 flex max-w-md items-start gap-3 border-t border-line pt-6 text-xs leading-6 text-muted">
            <ShieldCheck
              className="mt-1 size-4 shrink-0 text-brand"
              aria-hidden="true"
            />
            <p>
              Staff and administrator accounts are provided by your hostel.
              Public registration is for students only.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-xs sm:p-8">
          <div className="mb-6 flex items-center justify-between gap-3 border-b border-line pb-4">
            <h2 className="text-base font-semibold text-ink">
              {register ? 'Student registration' : 'Sign in to HostelFix'}
            </h2>
            <Badge tone={register ? 'success' : 'neutral'}>
              {register ? 'Student only' : 'All roles'}
            </Badge>
          </div>

          {register ? <RegisterForm /> : <LoginForm />}

          <p className="mt-6 border-t border-line pt-4 text-center text-sm text-muted">
            {register ? 'Already have an account?' : 'New to HostelFix?'}{' '}
            <Link
              className="inline-flex min-h-11 items-center rounded-sm font-semibold text-brand underline underline-offset-4"
              href={register ? '/login' : '/register'}
            >
              {register ? 'Sign in' : 'Student registration'}
            </Link>
          </p>
        </div>
      </div>
    </Container>
  );
}
