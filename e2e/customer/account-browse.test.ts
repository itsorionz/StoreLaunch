import { test, expect } from "@playwright/test";

test.describe("Customer Account Browse & History", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/account");
    await page.fill('[name="email"]', "customer@test.com");
    await page.fill('[name="password"]', "customer123");
    await page.click('button[type="submit"]');
    await page.goto("/account");
  });

  test("customer can view order history", async ({ page }) => {
    await page.goto("/account/orders");
    await expect(page.locator("text=Order History")).toBeVisible();
    await expect.poll(() => page.locator("tr").count()).toBeGreaterThan(0);
  });

  test("customer can view order detail", async ({ page }) => {
    await page.goto("/account/orders/1");
    await expect(page.locator("text=Order Detail")).toBeVisible();
  });

  test("customer can view profile", async ({ page }) => {
    await page.goto("/account/profile");
    await expect(page.locator("text=Profile")).toBeVisible();
  });

  test("customer can view wishlist", async ({ page }) => {
    await page.goto("/account/wishlist");
    await expect(page.locator("text=Wishlist")).toBeVisible();
  });
});
