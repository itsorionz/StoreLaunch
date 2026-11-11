import { test, expect } from "@playwright/test";

test.describe("Support Tickets", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/admin");
    await page.fill('[name="email"]', "admin@test.com");
    await page.fill('[name="password"]', "admin123");
    await page.click('button[type="submit"]');
    await page.goto("/admin");
  });

  test("admin can view support tickets list", async ({ page }) => {
    await page.goto("/admin/support-tickets");
    await expect(page.locator("text=Support Tickets")).toBeVisible();
  });

  test("admin can view support customers", async ({ page }) => {
    await page.goto("/admin/customers");
    await expect(page.locator("text=Customers")).toBeVisible();
  });

  test("admin can view support conversations", async ({ page }) => {
    await page.goto("/admin/support/conversation/1");
    await expect(page.locator("text=Conversation")).toBeVisible();
  });
});
