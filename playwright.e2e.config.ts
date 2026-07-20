import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end suite (authenticated flows). Run with:
 *   bun run test:e2e
 *
 * Requires TEST_EMAIL and TEST_PASSWORD env vars for an existing user
 * with access to at least one organization. Expects the dev server on
 * http://localhost:8080 and will start `bun run dev` if nothing is listening.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 1800 } },
    },
  ],
  webServer: {
    command: "bun run dev",
    url: "http://localhost:8080",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
