import { test, expect } from "@playwright/test";

test.describe("Store Account", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/account");
    await page.fill('[name="email"]', "rider@test.com");
    await page.fill('[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.goto("/account");
  });

  test("rider can view account orders", async ({ page }) => {
    await page.goto("/account/orders");
    await expect(page.locator("text=Orders")).toBeVisible();
  });

  test("rider can view account wallet", async ({ page }) => {
    await page.goto("/account/wallet");
    await expect(page.locator("text=Wallet")).toBeVisible();
  });

  test("rider can view account reviews", async ({ page }) => {
    await page.goto("/account/reviews");
    await expect(page.locator("text=Reviews")).toBeVisible();
  });
});
