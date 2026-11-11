import { test, expect } from "@playwright/test";

test.describe("Sales POS", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/sales");
    await page.fill('[name="email"]', "sales@test.com");
    await page.fill('[name="password"]', "sales123");
    await page.click('button[type="submit"]');
    await page.goto("/sales");
  });

  test("sales can view POS orders", async ({ page }) => {
    await page.goto("/sales/orders");
    await expect(page.locator("text=POS Orders")).toBeVisible();
  });

  test("sales can create new POS order", async ({ page }) => {
    await page.goto("/sales/orders/new");
    await expect(page.locator("text=New POS Order")).toBeVisible();
  });

  test("sales can view customer list", async ({ page }) => {
    await page.goto("/sales/customers");
    await expect(page.locator("text=Customers")).toBeVisible();
  });
});
