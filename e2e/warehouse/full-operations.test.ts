import { test, expect } from "@playwright/test";

test.describe("Warehouse Full Operations", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/warehouse");
    await page.fill('[name="email"]', "warehouse@test.com");
    await page.fill('[name="password"]', "warehouse123");
    await page.click('button[type="submit"]');
    await page.goto("/warehouse");
  });

  test("warehouse can view product stock", async ({ page }) => {
    await page.goto("/warehouse/products");
    await expect(page.locator("text=Products")).toBeVisible();
    await expect.poll(() => page.locator("tr").count()).toBeGreaterThan(0);
  });

  test("warehouse can create stock transfer", async ({ page }) => {
    await page.goto("/warehouse/stock-transfers/new");
    await page.selectOption('select[name="fromWarehouse"]', "WH-001");
    await page.selectOption('select[name="toWarehouse"]', "WH-002");
    await page.fill('input[name="productCount"]', "10");
    await page.click("button=Create Transfer");
    await expect(page.locator("text=Transfer created")).toBeVisible();
  });

  test("warehouse can process receiving", async ({ page }) => {
    await page.goto("/warehouse/receiving");
    await page.selectOption('select[name="receivingId"]', "REC-001");
    await page.click("button=Receive");
    await expect(page.locator("text=Items received")).toBeVisible();
  });
});
