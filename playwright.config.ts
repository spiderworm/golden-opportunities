import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5187',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Firefox is disabled until its macOS launch gap is resolved (PR #17):
    // bundled Firefox exits with 'Could not find profile folder' before tests run.
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    env: { ORBITAL_ANALYTICS: 'off', ORBITAL_ASSISTANT_PROVIDER: 'fake' },
    command: 'npm run dev -- --host 127.0.0.1 --port 5187 --strictPort',
    url: 'http://127.0.0.1:5187/?analytics-test=1',
    reuseExistingServer: false,
  },
});
