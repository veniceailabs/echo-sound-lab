import { defineConfig, devices } from '@playwright/test';

const previewHost = '127.0.0.1';
const previewPort = Number(process.env.PLAYWRIGHT_PORT || 4273);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://${previewHost}:${previewPort}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && npm run preview -- --host ${previewHost} --port ${previewPort} --strictPort`,
    port: previewPort,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'iPhone 13', use: { ...devices['iPhone 13'] } },
    { name: 'iPad (gen 7)', use: { ...devices['iPad (gen 7)'] } },
  ],
});
