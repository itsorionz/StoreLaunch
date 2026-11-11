import { test, expect } from "@playwright/test";

test.describe("Authentication Logout", () => {
  test("rider can log out", async ({ page }) => {
    await page.goto("/login?callbackUrl=/rider");
    await page.fill('[name="email"]', "rider@test.com");
    await page.fill('[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.goto("/rider");
    await page.click('button:text-is("Sign out")');
    await page.goto("/login");
    await expect(page).toHaveURL("/login");
  });

  test("admin can log out", async ({ page }) => {
    await page.goto("/login?callbackUrl=/admin");
    await page.fill('[name="email"]', "admin@test.com");
    await page.fill('[name="password"]', "admin123");
    await page.click('button[type="submit"]');
    await page.goto("/admin");
    await page.click('button:text-is("Sign out")');
    await page.goto("/login");
    await expect(page).toHaveURL("/login");
  });
});
