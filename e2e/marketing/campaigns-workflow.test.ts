import { test, expect } from "@playwright/test";

test.describe("Marketing Campaigns Full Workflow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/marketing");
    await page.fill('[name="email"]', "marketing@test.com");
    await page.fill('[name="password"]', "marketing123");
    await page.click('button[type="submit"]');
    await page.goto("/marketing");
  });

  test("marketing can launch campaign", async ({ page }) => {
    await page.goto("/marketing/campaigns/1");
    await page.click("button=Launch");
    await expect(page.locator("text=Campaign launched")).toBeVisible();
  });

  test("marketing can view campaign analytics", async ({ page }) => {
    await page.goto("/marketing/campaigns/1/analytics");
    await expect(page.locator("text=Analytics")).toBeVisible();
  });

  test("marketing can add campaign products", async ({ page }) => {
    await page.goto("/marketing/campaigns/1/products/new");
    await page.selectOption('select[name="product"]', "SKU-001");
    await page.click("button=Add Product");
    await expect(page.locator("text=Product added")).toBeVisible();
  });
});
