import { test, expect } from "@playwright/test";

test.describe("Warehouse Operations", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/warehouse");
    await page.fill('[name="email"]', "warehouse@test.com");
    await page.fill('[name="password"]', "warehouse123");
    await page.click('button[type="submit"]');
    await page.goto("/warehouse");
  });

  test("warehouse can view stock levels", async ({ page }) => {
    await page.goto("/warehouse/stock");
    await expect(page.locator("text=Stock Levels")).toBeVisible();
  });

  test("warehouse can view stock transfers", async ({ page }) => {
    await page.goto("/warehouse/stock-transfers");
    await expect(page.locator("text=Stock Transfers")).toBeVisible();
  });

  test("warehouse can view receiving", async ({ page }) => {
    await page.goto("/warehouse/receiving");
    await expect(page.locator("text=Receiving")).toBeVisible();
  });
});
