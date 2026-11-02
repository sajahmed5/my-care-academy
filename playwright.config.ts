import { defineConfig, devices } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";

// The QA suite runs against the app served by scripts/qa/serve.mjs on port
// 3100, which loads .env.test (the LOCAL Supabase stack). Sessions for each
// role are saved by tests/e2e/global-setup.ts under tests/e2e/.auth/.
if (existsSync(".env.test")) {
  for (const line of readFileSync(".env.test", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
const baseURL = process.env.QA_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.spec\.ts/,
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "en-GB",
    timezoneId: "Europe/London",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, grepInvert: /@mobile/ },
    // The phone layout: the brief asks for everything at 390px wide.
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } }, grep: /@mobile/ },
  ],
  webServer: {
    command: "node scripts/qa/serve.mjs",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 600_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
