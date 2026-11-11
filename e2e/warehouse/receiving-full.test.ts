import { test, expect } from "@playwright/test";

test.describe("Warehouse Receiving Full", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/warehouse");
    await page.fill('[name="email"]', "warehouse@test.com");
    await page.fill('[name="password"]', "warehouse123");
    await page.click('button[type="submit"]');
    await page.goto("/warehouse");
  });

  test("warehouse can receive shipment", async ({ page }) => {
    await page.goto("/warehouse/receiving/new");
    await page.fill('input[name="shipmentId"]', "SHIP-001");
    await page.fill('input[name="expectedItems"]', "10");
    await page.click("button=Start Receiving");
    await expect(page.locator("text=Receiving started")).toBeVisible();
  });

  test("warehouse can complete receiving", async ({ page }) => {
    await page.goto("/warehouse/receiving/1");
    await page.click("button=Complete Receiving");
    await expect(page.locator("text=Receiving completed")).toBeVisible();
  });

  test("warehouse can add receiving note", async ({ page }) => {
    await page.goto("/warehouse/receiving/1/notes");
    await page.fill('textarea[name="note"]', "Damaged item - replace");
    await page.click("button=Save Note");
    await expect(page.locator("text=Note saved")).toBeVisible();
  });
});
