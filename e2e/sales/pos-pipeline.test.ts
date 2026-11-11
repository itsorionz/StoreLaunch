import { test, expect } from "@playwright/test";

test.describe("Sales POS Full Pipeline", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/sales");
    await page.fill('[name="email"]', "sales@test.com");
    await page.fill('[name="password"]', "sales123");
    await page.click('button[type="submit"]');
    await page.goto("/sales");
  });

  test("sales can create POS order with products", async ({ page }) => {
    await page.goto("/sales/orders/new");
    await page.selectOption('select[name="customer"]', "CUST-001");
    await page.selectOption('select[name="product"]', "SKU-001");
    await page.fill('input[name="quantity"]', "2");
    await page.click("button=Add Item");
    await expect(page.locator("text=Item added")).toBeVisible();
  });

  test("sales can view order status", async ({ page }) => {
    await page.goto("/sales/orders/1");
    await expect(page.locator("text=Order Status")).toBeVisible();
  });

  test("sales can process payment", async ({ page }) => {
    await page.goto("/sales/orders/1/payment");
    await page.fill('input[name="amount"]', "1000");
    await page.click("button=Process Payment");
    await expect(page.locator("text=Payment processed")).toBeVisible();
  });
});
