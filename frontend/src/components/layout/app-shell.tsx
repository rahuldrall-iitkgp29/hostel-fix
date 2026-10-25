'use client';

import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ClipboardList,
  Wrench,
  ShieldCheck,
  User,
  LogOut,
  Menu,
  X,
  Building2,
} from 'lucide-react';
import { Brand } from './brand';
import { Container } from './container';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';

export type Role = 'STUDENT' | 'STAFF' | 'ADMIN';

export type AppUserSummary = {
  name: string;
  email: string;
  role: Role;
  hostelName?: string;
  roomLabel?: string;
};

export type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
};

export const roleNavigation: Record<Role, NavItem[]> = {
  STUDENT: [
    { label: 'Dashboard', href: '/student/dashboard', icon: LayoutDashboard },
    {
      label: 'My Complaints',
      href: '/student/complaints',
      icon: ClipboardList,
    },
    { label: 'Profile', href: '/profile', icon: User },
  ],
  STAFF: [
    { label: 'Dashboard', href: '/staff/dashboard', icon: LayoutDashboard },
    { label: 'Assigned Work', href: '/staff/queue', icon: Wrench },
    { label: 'Profile', href: '/profile', icon: User },
  ],
  ADMIN: [
    { label: 'Overview', href: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Triage & Review', href: '/admin/triage', icon: ClipboardList },
    { label: 'Assignments', href: '/admin/assignment', icon: ShieldCheck },
    { label: 'Profile', href: '/profile', icon: User },
  ],
};

const roleLabels: Record<Role, string> = {
  STUDENT: 'Student',
  STAFF: 'Maintenance Staff',
  ADMIN: 'Hostel Admin',
};

const roleTones: Record<Role, 'neutral' | 'success' | 'warning'> = {
  STUDENT: 'neutral',
  STAFF: 'warning',
  ADMIN: 'success',
};

export type AppShellProps = {
  user: AppUserSummary;
  children: ReactNode;
  onLogout?: () => void;
};

export function AppShell({ user, children, onLogout }: AppShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const items = roleNavigation[user.role] || [];

  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setMobileMenuOpen(false);
  }

  // Handle Escape key for mobile drawer
  useEffect(() => {
    if (!mobileMenuOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Mobile drawer backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Top bar on all screen sizes */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur-md">
        <Container className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line text-muted transition-colors hover:bg-canvas hover:text-ink lg:hidden"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <X className="size-5" />
              ) : (
                <Menu className="size-5" />
              )}
            </button>
            <Brand />
            <span className="hidden sm:inline-block">
              <Badge tone={roleTones[user.role]}>{roleLabels[user.role]}</Badge>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right md:block">
              <p className="text-sm font-semibold text-ink">{user.name}</p>
              <p className="text-xs text-muted flex items-center justify-end gap-1">
                {user.hostelName && (
                  <>
                    <Building2 className="size-3" />
                    <span>{user.hostelName}</span>
                  </>
                )}
                {user.roomLabel && <span>• Room {user.roomLabel}</span>}
              </p>
            </div>

            <Link
              href="/profile"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line text-muted transition-colors hover:bg-brand-soft hover:text-brand"
              aria-label="My Profile"
            >
              <User className="size-5" />
            </Link>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-xs font-semibold text-muted transition-colors hover:bg-canvas hover:text-danger"
                aria-label="Sign out"
              >
                <LogOut className="size-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            )}
          </div>
        </Container>
      </header>

      {/* Main body with desktop sidebar and main content */}
      <div className="mx-auto flex max-w-7xl">
        {/* Desktop sidebar */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 border-r border-line bg-surface p-4 lg:block">
          <div className="space-y-1">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand text-white font-semibold shadow-xs'
                      : 'text-muted hover:bg-brand-soft hover:text-brand'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="size-4.5 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="absolute bottom-4 left-4 right-4 rounded-xl border border-line bg-canvas p-3">
            <p className="text-xs font-semibold text-ink">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
              <span>{roleLabels[user.role]}</span>
              {user.roomLabel && <span>Room {user.roomLabel}</span>}
            </div>
          </div>
        </aside>

        {/* Mobile drawer */}
        <div
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-72 border-r border-line bg-surface p-4 shadow-xl transition-transform duration-200 ease-in-out lg:hidden',
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Application navigation"
        >
          <div className="flex h-12 items-center justify-between border-b border-line pb-3">
            <Brand />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line text-muted"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="mt-4 space-y-1">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand text-white font-semibold'
                      : 'text-muted hover:bg-brand-soft hover:text-brand'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="size-4.5 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="mt-8 border-t border-line pt-4">
            <div className="rounded-xl border border-line bg-canvas p-3">
              <p className="text-xs font-semibold text-ink">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
              <div className="mt-2">
                <Badge tone={roleTones[user.role]}>
                  {roleLabels[user.role]}
                </Badge>
              </div>
            </div>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-danger/20 text-xs font-semibold text-danger transition-colors hover:bg-danger/10"
              >
                <LogOut className="size-4" />
                <span>Sign out</span>
              </button>
            )}
          </div>
        </div>

        {/* Content area */}
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
