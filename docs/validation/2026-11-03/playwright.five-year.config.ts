import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
 testDir: "./e2e", testMatch: "five-year-validation.spec.ts", workers: 1,
 reporter: "list", use: { baseURL: "http://127.0.0.1:15398", trace: "retain-on-failure" },
 projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }, { name: "webkit", use: { ...devices["Desktop Safari"] } }],
 webServer: { command: "npm start", url: "http://127.0.0.1:15398/?analytics-test=1", reuseExistingServer: false,
 env: { PORT: "15398", ORBITAL_HOST: "127.0.0.1", ORBITAL_DATA_DIR: "/private/tmp/orbital-playthrough-6xjnwmf8/five-year-data", ORBITAL_ANALYTICS: "off", ORBITAL_ALMA_PROVIDER: "scripted", ORBITAL_ASSISTANT_PROVIDER: "fake" } }
});
