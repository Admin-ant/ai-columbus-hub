import { defineConfig, devices } from "@playwright/test";

/**
 * Visual regression suite. Run with:
 *   bun run test:visual           - run tests
 *   bun run test:visual:update    - update snapshots
 *
 * Expects the dev server on http://localhost:8080. The config will start
 * `bun run dev` automatically when nothing is listening yet.
 */
export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
  },
  expect: {
    toHaveScreenshot: {
      // Tolerate sub-pixel anti-aliasing differences across runs.
      maxDiffPixelRatio: 0.01,
      threshold: 0.2,
      animations: "disabled",
    },
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
