import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
const fixtureSchema = z.object({
  student: z.string(),
  staff: z.string(),
  admin: z.string(),
  other: z.string(),
  staffId: z.string(),
  categoryId: z.string(),
  password: z.string(),
});
const fixture = () =>
  fixtureSchema.parse(
    JSON.parse(readFileSync('.local/browser-state.json', 'utf8'))
  );
const png = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex'
);
async function login(
  page: Page,
  role: 'student' | 'staff' | 'admin' | 'other'
) {
  await page.goto('/login');
  await page.getByLabel('Hostel email').fill(fixture()[role]);
  await page.getByLabel('Password', { exact: true }).fill(fixture().password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
}
async function act(page: Page, name: string, note: string) {
  await page.getByRole('button', { name, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('textarea').fill(note);
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
test('real browser: photo report, editing, priority, assignment, resolution and feedback', async ({
  page,
  browser,
}) => {
  await login(page, 'student');
  await page.goto('/student/complaints/new');
  await page.getByLabel('Complaint title').fill('Browser ceiling fan repair');
  await page
    .getByLabel('Detailed description')
    .fill('The ceiling fan stopped working and requires technician repair.');
  await page
    .getByLabel('Category', { exact: true })
    .selectOption(fixture().categoryId);
  await page
    .locator('#photo-upload')
    .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByText('photo.png', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Submit maintenance report' }).click();
  await expect(page).toHaveURL(/\/complaints\/[a-f\d]{24}$/);
  const complaintPath = new URL(page.url()).pathname;
  await expect(page.getByRole('img', { name: 'photo.png' })).toBeVisible();
  await page
    .getByRole('button', { name: 'Edit complaint', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByLabel('Complaint title')
    .fill('Edited browser ceiling fan repair');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Edited browser ceiling fan repair' })
  ).toBeVisible();
  const adminContext = await browser.newContext({
    baseURL: 'http://localhost:3100',
  });
  const adminPage = await adminContext.newPage();
  await login(adminPage, 'admin');
  await adminPage.goto(complaintPath);
  await expect(
    adminPage.getByRole('button', { name: 'Change Priority', exact: true })
  ).toBeVisible();
  await adminPage
    .getByRole('button', { name: 'Change Priority', exact: true })
    .click();
  await adminPage.getByLabel('New Priority').selectOption('HIGH');
  await adminPage
    .getByRole('dialog')
    .locator('textarea')
    .fill('Urgent essential repair confirmed by administrator.');
  await adminPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirm', exact: true })
    .click();
  await expect(adminPage.getByRole('dialog')).not.toBeVisible();
  await act(
    adminPage,
    'Triage',
    'Verified repair request and correct location.'
  );
  await adminPage
    .getByRole('button', { name: 'Assign Staff', exact: true })
    .click();
  await adminPage
    .getByLabel('Select Eligible Staff')
    .selectOption(fixture().staffId);
  await adminPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirm', exact: true })
    .click();
  await expect(adminPage.getByRole('dialog')).not.toBeVisible();
  const staffContext = await browser.newContext({
    baseURL: 'http://localhost:3100',
  });
  const staffPage = await staffContext.newPage();
  await login(staffPage, 'staff');
  await staffPage.goto(complaintPath);
  await expect(staffPage.getByRole('img', { name: 'photo.png' })).toBeVisible();
  await act(
    staffPage,
    'Start Work',
    'Started replacing the broken ceiling fan switch.'
  );
  await act(
    staffPage,
    'Mark Resolved',
    'Replaced ceiling fan switch and verified normal operation.'
  );
  await page.reload();
  await act(
    page,
    'Confirm & Close',
    'Confirmed that the repair works correctly.'
  );
  await page
    .getByRole('button', { name: 'Leave Feedback', exact: true })
    .click();
  await page.getByRole('button', { name: '5 Stars', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirm', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await adminContext.close();
  await staffContext.close();
});
test('real browser: concurrent refresh tabs retain the session and logout clears both', async ({
  page,
  context,
}) => {
  await login(page, 'student');
  const other = await context.newPage();
  await Promise.all([page.reload(), other.goto('/student/dashboard')]);
  await expect(page).toHaveURL(/student\/dashboard/);
  await expect(other).toHaveURL(/student\/dashboard/);
  await expect(
    page.getByRole('button', { name: /sign out|log out/i }).first()
  ).toBeVisible();
  await page
    .getByRole('button', { name: /sign out|log out/i })
    .first()
    .click();
  await expect(page).toHaveURL(/login/);
  await expect(other).toHaveURL(/login/);
});

test('real browser: upload coordination, failed deletion, edit conflicts and unauthorized access', async ({
  page,
  browser,
}) => {
  await login(page, 'student');
  await page.goto('/student/complaints/new');
  await page.getByLabel('Complaint title').fill('Browser failure-path repair');
  await page
    .getByLabel('Detailed description')
    .fill(
      'A valid maintenance issue used to verify rejection and retry behavior.'
    );
  await page
    .getByLabel('Category', { exact: true })
    .selectOption(fixture().categoryId);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/uploads', async (route) => {
    await gate;
    await route.continue();
  });
  await page.locator('#photo-upload').setInputFiles({
    name: 'failure-photo.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await expect(
    page.getByRole('button', { name: 'Submit maintenance report' })
  ).toBeDisabled();
  release();
  await expect(
    page.getByText('failure-photo.png', { exact: true })
  ).toBeVisible();
  await page.unroute('**/api/v1/uploads');
  await page.route('**/api/v1/uploads/*', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'FORBIDDEN',
          message: 'Deletion temporarily denied.',
          requestId: '7dc4e59c-a102-46a4-9530-45b33331c391',
        },
      }),
    })
  );
  await page
    .getByRole('button', { name: 'Remove photo failure-photo.png' })
    .click();
  await expect(
    page.getByText('Deletion temporarily denied.', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText('failure-photo.png', { exact: true })
  ).toBeVisible();
  await page.unroute('**/api/v1/uploads/*');
  await page
    .getByRole('button', { name: 'Remove photo failure-photo.png' })
    .click();
  await expect(
    page.getByText('failure-photo.png', { exact: true })
  ).not.toBeVisible();
  await page.getByRole('button', { name: 'Submit maintenance report' }).click();
  await expect(page).toHaveURL(/\/complaints\/[a-f\d]{24}$/);
  const complaintPath = new URL(page.url()).pathname;
  await page.route('**/api/v1/complaints/*', async (route) => {
    if (route.request().method() === 'PATCH')
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'VERSION_CONFLICT',
            message: 'Record changed.',
            requestId: '7dc4e59c-a102-46a4-9530-45b33331c391',
          },
        }),
      });
    else await route.continue();
  });
  await page
    .getByRole('button', { name: 'Edit complaint', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByLabel('Complaint title')
    .fill('Changed title rejected by conflict');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(
    page.getByText(
      'This complaint changed. Reload it and review your edits before saving.'
    )
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Reload complaint', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Browser failure-path repair' })
  ).toBeVisible();
  const outsider = await browser.newContext({
    baseURL: 'http://localhost:3100',
  });
  const otherPage = await outsider.newPage();
  await login(otherPage, 'other');
  const denied = otherPage.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/complaints/') &&
      response.status() === 404
  );
  await otherPage.goto(complaintPath);
  await denied;
  await expect(
    otherPage.getByText(
      'Unable to load complaint details. Please check your connection.'
    )
  ).toBeVisible();
  await outsider.close();
});

test('real browser: comment and activity histories expose subsequent pages', async ({
  page,
}) => {
  const data = fixture();
  const headers = { Origin: 'http://localhost:3100', 'X-CSRF-Protection': '1' };
  const loginResponse = await page.request.post(
    'http://localhost:5100/api/v1/auth/login',
    { headers, data: { email: data.student, password: data.password } }
  );
  expect(loginResponse.status()).toBe(200);
  const auth = z
    .object({ data: z.object({ accessToken: z.string() }) })
    .parse(await loginResponse.json());
  const authenticated = {
    ...headers,
    Authorization: `Bearer ${auth.data.accessToken}`,
  };
  const created = await page.request.post(
    'http://localhost:5100/api/v1/complaints',
    {
      headers: authenticated,
      data: {
        clientRequestId: crypto.randomUUID(),
        title: 'Paginated browser repair',
        description:
          'A repair report with a long discussion and immutable activity history.',
        categoryId: data.categoryId,
        // Use the authenticated profile's allocation rather than a fixture guess.
        location: await (async () => {
          const me = await page.request.get(
            'http://localhost:5100/api/v1/users/me',
            { headers: authenticated }
          );
          const user = z
            .object({
              data: z.object({
                user: z.object({
                  hostelId: z.string(),
                  blockId: z.string(),
                  roomId: z.string(),
                }),
              }),
            })
            .parse(await me.json()).data.user;
          return { type: 'ROOM', ...user };
        })(),
        indicators: {
          safetyRisk: false,
          essentialServiceOutage: false,
          affectsMultipleRooms: false,
          functionalityLoss: false,
        },
        attachmentIds: [],
      },
    }
  );
  expect(created.status()).toBe(201);
  const complaint = z
    .object({
      data: z.object({
        complaint: z.object({ id: z.string(), version: z.number() }),
      }),
    })
    .parse(await created.json()).data.complaint;
  for (let index = 1; index <= 21; index += 1) {
    const comment = await page.request.post(
      `http://localhost:5100/api/v1/complaints/${complaint.id}/comments`,
      {
        headers: authenticated,
        data: {
          expectedVersion: complaint.version + index - 1,
          body: `Discussion message number ${index}`,
        },
      }
    );
    expect(comment.status()).toBe(201);
  }
  await page.goto(`/complaints/${complaint.id}`);
  const comments = page.getByRole('navigation', {
    name: 'Comments pagination',
  });
  await expect(comments.getByText('Page 1 of 2')).toBeVisible();
  await comments.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    page.getByText('Discussion message number 21', { exact: true })
  ).toBeVisible();
  const activity = page.getByRole('navigation', {
    name: 'Activity pagination',
  });
  await activity.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(activity.getByText('Page 2 of 2')).toBeVisible();
});
