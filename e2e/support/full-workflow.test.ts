import { test, expect } from "@playwright/test";

test.describe("Support Full Workflow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/support");
    await page.fill('[name="email"]', "support@test.com");
    await page.fill('[name="password"]', "support123");
    await page.click('button[type="submit"]');
    await page.goto("/support");
  });

  test("support can view ticket detail", async ({ page }) => {
    await page.goto("/support/tickets/1");
    await expect(page.locator("text=Ticket Detail")).toBeVisible();
  });

  test("support can update ticket status", async ({ page }) => {
    await page.goto("/support/tickets/1");
    await page.selectOption('select[name="status"]', "resolved");
    await page.click("button=Update");
    await expect(page.locator("text=Ticket updated")).toBeVisible();
  });

  test("support can add ticket message", async ({ page }) => {
    await page.goto("/support/tickets/1/messages");
    await page.fill('textarea[placeholder="Add a message..."]', "Follow up call completed");
    await page.click("button=Send");
    await expect(page.locator("text=Message sent")).toBeVisible();
  });
});
