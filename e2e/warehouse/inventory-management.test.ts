import { test, expect } from "@playwright/test";

test.describe("Warehouse Inventory Management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/warehouse");
    await page.fill('[name="email"]', "warehouse@test.com");
    await page.fill('[name="password"]', "warehouse123");
    await page.click('button[type="submit"]');
    await page.goto("/warehouse");
  });

  test("warehouse can adjust stock quantity", async ({ page }) => {
    await page.goto("/warehouse/stock-adjustment");
    await page.selectOption('select[name="product"]', "SKU-001");
    await page.fill('input[name="quantity"]', "50");
    await page.selectOption('select[name="adjustmentType"]', "increase");
    await page.fill('input[name="reason"]', "Stocktake adjustment");
    await page.click("button=Apply Adjustment");
    await expect(page.locator("text=Stock adjusted")).toBeVisible();
  });

  test("warehouse can view inventory adjustments", async ({ page }) => {
    await page.goto("/warehouse/inventory-adjustments");
    await expect(page.locator("text=Inventory Adjustments")).toBeVisible();
  });

  test("warehouse can view low stock alerts", async ({ page }) => {
    await page.goto("/warehouse/low-stock");
    await expect(page.locator("text=Low Stock")).toBeVisible();
  });
});
