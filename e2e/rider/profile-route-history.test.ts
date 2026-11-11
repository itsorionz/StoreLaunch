import { test, expect } from "@playwright/test";

test.describe("Rider Profile & Route", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/rider");
    await page.fill('[name="email"]', "rider@test.com");
    await page.fill('[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.goto("/rider");
  });

  test("rider can view profile", async ({ page }) => {
    await page.goto("/rider/profile");
    await expect(page.locator("text=Profile")).toBeVisible();
  });

  test("rider can view route", async ({ page }) => {
    await page.goto("/rider/route");
    await expect(page.locator("text=My Route")).toBeVisible();
  });

  test("rider can view delivery history", async ({ page }) => {
    await page.goto("/rider/history");
    await expect(page.locator("text=Delivery History")).toBeVisible();
  });
});
