import { test, expect } from "@playwright/test";

test.describe("Marketing Campaigns", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/marketing");
    await page.fill('[name="email"]', "marketing@test.com");
    await page.fill('[name="password"]', "marketing123");
    await page.click('button[type="submit"]');
    await page.goto("/marketing");
  });

  test("marketing can view campaigns", async ({ page }) => {
    await page.goto("/marketing/campaigns");
    await expect(page.locator("text=Campaigns")).toBeVisible();
  });

  test("marketing can create campaign", async ({ page }) => {
    await page.goto("/marketing/campaigns/new");
    await expect(page.locator("text=New Campaign")).toBeVisible();
  });

  test("marketing can view campaign products", async ({ page }) => {
    await page.goto("/marketing/campaigns/1/products");
    await expect(page.locator("text=Products")).toBeVisible();
  });
});
