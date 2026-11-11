import { test, expect } from "@playwright/test";

test.describe("Admin Order Detail", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/admin");
    await page.fill('[name="email"]', "admin@test.com");
    await page.fill('[name="password"]', "admin123");
    await page.click('button[type="submit"]');
    await page.goto("/admin");
  });

  test("admin can view order detail", async ({ page }) => {
    await page.goto("/admin/orders/12345");
    await expect(page.locator("text=Order Detail")).toBeVisible();
  });

  test("admin can view products list", async ({ page }) => {
    await page.goto("/admin/products");
    await expect(page.locator("table")).toBeVisible({ timeout: 5000 });
    await expect.poll(() => page.locator("tr").count()).toBeGreaterThan(0);
  });
});
