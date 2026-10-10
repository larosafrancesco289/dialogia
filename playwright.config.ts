import { defineConfig, devices } from '@playwright/test';

// Ports of their own: a fresh origin with no keys or chats, and clear of the
// dev servers (3000s) and the hand-run mock (3999).
const APP_PORT = 4318;
const MOCK_PORT = 4399;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    // The production build registers a service worker, which would serve a
    // stale build to the next run.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: '**/*.phone.spec.ts',
    },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: '**/*.phone.spec.ts' },
  ],
  webServer: [
    {
      command: `bunx tsx e2e/mock/server.ts`,
      env: { PORT: String(MOCK_PORT) },
      url: `http://localhost:${MOCK_PORT}/v1/models`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `bun run build && bunx vite preview --port ${APP_PORT} --strictPort`,
      url: `http://localhost:${APP_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});

export const MOCK_URL = `http://localhost:${MOCK_PORT}/v1`;
