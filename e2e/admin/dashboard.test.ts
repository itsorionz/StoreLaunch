import { test, expect } from "@playwright/test";

test.describe("Admin Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/admin");
    await page.fill('[name="email"]', "admin@test.com");
    await page.fill('[name="password"]', "admin123");
    await page.click('button[type="submit"]');
    await page.goto("/admin");
  });

  test("admin dashboard displays metrics", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator("text=Total Orders")).toBeVisible();
    await expect(page.locator("text=Total Revenue")).toBeVisible();
    await expect(page.locator("text=Active Riders")).toBeVisible();
  });
});
