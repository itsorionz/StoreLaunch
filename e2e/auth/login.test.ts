import { test } from "@playwright/test";

test.describe("Authentication", () => {
  test("rider can log in", async ({ page }) => {
    await page.goto("/login?callbackUrl=/rider");
    await page.fill('[name="email"]', "rider@test.com");
    await page.fill('[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.goto("/rider");
  });

  test("admin can log in", async ({ page }) => {
    await page.goto("/login?callbackUrl=/admin");
    await page.fill('[name="email"]', "admin@test.com");
    await page.fill('[name="password"]', "admin123");
    await page.click('button[type="submit"]');
    await page.goto("/admin");
  });
});
