/**
 * Playwright Configuration
 * Configuration for end-to-end tests
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  reporter: [["list"], ["html", { output: "last-result" }]],
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    viewport: { width: 1280, height: 720 },
    locale: "en-US",
    timezoneId: "America/New_York",
  },
  projects: [
    {
      name: "Chromium",
      use: { ...devices["Desktop Chrome"], headless: true },
    },
  ],
});
