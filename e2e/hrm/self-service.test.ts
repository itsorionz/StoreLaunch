import { test, expect } from "@playwright/test";

test.describe("HRM Employee Self-Service", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/hrm/self");
    await page.fill('[name="email"]', "employee@test.com");
    await page.fill('[name="password"]', "employee123");
    await page.click('button[type="submit"]');
    await page.goto("/hrm/self");
  });

  test("employee can view profile", async ({ page }) => {
    await page.goto("/hrm/self/profile");
    await expect(page.locator("text=Profile")).toBeVisible();
  });

  test("employee can view pay stubs", async ({ page }) => {
    await page.goto("/hrm/self/pay-stubs");
    await expect(page.locator("text=Pay Stubs")).toBeVisible();
  });

  test("employee can view attendance", async ({ page }) => {
    await page.goto("/hrm/self/attendance");
    await expect(page.locator("text=My Attendance")).toBeVisible();
  });
});
