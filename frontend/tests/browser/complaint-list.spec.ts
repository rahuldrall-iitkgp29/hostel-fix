import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { complaint } from '../fixtures/complaints';

async function login(page: Page, role: 'student' | 'staff' | 'admin') {
  const fixture = z
    .object({
      student: z.string(),
      staff: z.string(),
      admin: z.string(),
      password: z.string(),
    })
    .parse(JSON.parse(readFileSync('.local/browser-state.json', 'utf8')));
  await page.goto('/login');
  await page.getByLabel('Hostel email').fill(fixture[role]);
  await page.getByLabel('Password', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
}

for (const { role, path } of [
  { role: 'student', path: '/student/complaints' },
  { role: 'staff', path: '/staff/queue' },
  { role: 'admin', path: '/admin/triage' },
  { role: 'admin', path: '/admin/assignment' },
] as const) {
  test(`${path}: renders, filters and paginates without repeating settled requests`, async ({
    page,
  }) => {
    const reads: URL[] = [];
    await page.route('**/api/v1/complaints?*', async (route) => {
      const url = new URL(route.request().url());
      reads.push(url);
      await route.fulfill({
        json: {
          data: [complaint],
          meta: {
            requestId: crypto.randomUUID(),
            page: Number(url.searchParams.get('page')),
            limit: 10,
            total: 20,
            totalPages: 2,
          },
        },
      });
    });
    await login(page, role);
    await page.locator(`a[href="${path}"]`).first().click();
    await expect(
      page.getByText(complaint.title, { exact: true })
    ).toBeVisible();
    // Development Strict Mode may issue two initial reads. Responses and state
    // updates must not keep triggering the effect after those reads settle.
    await page.waitForTimeout(1200);
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.length).toBeLessThanOrEqual(2);
    let settled = reads.length;
    const filtered = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/complaints' &&
        new URL(response.url()).searchParams.get('status') === 'CLOSED'
    );
    await page.getByLabel('Filter by status').selectOption('CLOSED');
    await filtered;
    await page.waitForTimeout(1200);
    expect(reads).toHaveLength(settled + 1);
    settled = reads.length;
    const paginated = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/complaints' &&
        new URL(response.url()).searchParams.get('page') === '2'
    );
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await paginated;
    await expect(
      page.getByText('Showing page 2 of 2 (20 total)')
    ).toBeVisible();
    await page.waitForTimeout(1200);
    expect(reads).toHaveLength(settled + 1);
  });
}

test('rate-limited reports and dashboard show the API message and wait for an explicit retry', async ({
  page,
}) => {
  await login(page, 'student');
  let reads = 0;
  await page.route('**/api/v1/complaints?*', async (route) => {
    reads++;
    await route.fulfill({
      status: 429,
      headers: { 'Retry-After': '60' },
      json: {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Try again later.',
          requestId: crypto.randomUUID(),
        },
      },
    });
  });
  await page.locator('a[href="/student/complaints"]').first().click();
  await expect(
    page.getByRole('alert').getByText('Too many requests. Try again later.')
  ).toBeVisible();
  await page.waitForTimeout(1200);
  expect(reads).toBeLessThanOrEqual(2);
  const settled = reads;
  const retried = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/v1/complaints'
  );
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await retried;
  await page.waitForTimeout(1200);
  expect(reads).toBe(settled + 1);
  await page.route('**/api/v1/dashboard/student', (route) =>
    route.fulfill({
      status: 429,
      json: {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Try again later.',
          requestId: crypto.randomUUID(),
        },
      },
    })
  );
  await page.locator('a[href="/student/dashboard"]').first().click();
  await expect(
    page.getByRole('alert').getByText('Too many requests. Try again later.')
  ).toBeVisible();
});
