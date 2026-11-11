import { test, expect } from "@playwright/test";

test.describe("Admin Warehouse & Delivery", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/admin");
    await page.fill('[name="email"]', "admin@test.com");
    await page.fill('[name="password"]', "admin123");
    await page.click('button[type="submit"]');
    await page.goto("/admin");
  });

  test("admin can view warehouse page", async ({ page }) => {
    await page.goto("/admin/warehouse");
    await expect(page.locator("text=Warehouse")).toBeVisible();
  });

  test("admin can view delivery hubs", async ({ page }) => {
    await page.goto("/admin/delivery-hubs");
    await expect(page.locator("text=Delivery Hubs")).toBeVisible();
  });

  test("admin can view delivery zones", async ({ page }) => {
    await page.goto("/admin/delivery-zones");
    await expect(page.locator("text=Delivery Zones")).toBeVisible();
  });
});
