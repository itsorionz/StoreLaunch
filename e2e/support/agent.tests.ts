import { test, expect } from "@playwright/test";

test.describe("Support Agent", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/support");
    await page.fill('[name="email"]', "support@test.com");
    await page.fill('[name="password"]', "support123");
    await page.click('button[type="submit"]');
    await page.goto("/support");
  });

  test("support can view open tickets", async ({ page }) => {
    await page.goto("/support/tickets");
    await expect(page.locator("text=Open Tickets")).toBeVisible();
  });

  test("support can view resolved tickets", async ({ page }) => {
    await page.goto("/support/tickets?status=resolved");
    await expect(page.locator("text=Resolved")).toBeVisible();
  });

  test("support can create new ticket", async ({ page }) => {
    await page.goto("/support/tickets/new");
    await expect(page.locator("text=New Ticket")).toBeVisible();
  });
});
