import { describe, expect, it } from 'vitest';
import { roleNavigation, type Role } from '../src/components/layout/app-shell';

describe('AppShell Role Navigation Configuration', () => {
  it('provides distinct, role-appropriate navigation for all three roles', () => {
    const roles: Role[] = ['STUDENT', 'STAFF', 'ADMIN'];

    for (const role of roles) {
      const items = roleNavigation[role];
      expect(items).toBeDefined();
      expect(items.length).toBeGreaterThanOrEqual(3);

      // Every role has a profile link
      expect(items.some((item) => item.href === '/profile')).toBe(true);
    }
  });

  it('ensures student navigation links to student dashboard and complaints', () => {
    const studentItems = roleNavigation['STUDENT'];
    expect(studentItems.some((i) => i.href === '/student/dashboard')).toBe(
      true
    );
    expect(studentItems.some((i) => i.href === '/student/complaints')).toBe(
      true
    );
  });

  it('ensures staff navigation links to staff queue', () => {
    const staffItems = roleNavigation['STAFF'];
    expect(staffItems.some((i) => i.href === '/staff/dashboard')).toBe(true);
    expect(staffItems.some((i) => i.href === '/staff/queue')).toBe(true);
  });

  it('ensures admin navigation links to triage and assignment', () => {
    const adminItems = roleNavigation['ADMIN'];
    expect(adminItems.some((i) => i.href === '/admin/dashboard')).toBe(true);
    expect(adminItems.some((i) => i.href === '/admin/triage')).toBe(true);
    expect(adminItems.some((i) => i.href === '/admin/assignment')).toBe(true);
  });
});
