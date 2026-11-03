import { defineConfig, devices } from "@playwright/test";

const port = process.env.E2E_PORT ?? "5187";
if (!/^[1-9][0-9]{0,4}$/.test(port) || Number(port) > 65535) {
  throw new Error("E2E_PORT must be an integer from 1 to 65535.");
}
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL,
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Firefox is disabled until its macOS launch gap is resolved (PR #17):
    // bundled Firefox exits with 'Could not find profile folder' before tests run.
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    env: { E2E_PORT: port, ORBITAL_ANALYTICS: "off", ORBITAL_ASSISTANT_PROVIDER: "fake" },
    command: "npm run build && node e2e/server.mjs",
    url: `${baseURL}/?analytics-test=1`,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  },
});
