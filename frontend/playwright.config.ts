import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  globalSetup: './tests/browser/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3100',
    headless: true,
    trace: 'retain-on-failure',
    channel: process.env.PLAYWRIGHT_CHANNEL,
  },
  webServer: {
    command: 'npm run dev -- --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:5100/api/v1' },
  },
});
