import { test, expect } from "@playwright/test";

test.describe("Support Ticket Creation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/support");
    await page.fill('[name="email"]', "support@test.com");
    await page.fill('[name="password"]', "support123");
    await page.click('button[type="submit"]');
    await page.goto("/support");
  });

  test("support can create new ticket", async ({ page }) => {
    await page.goto("/support/tickets/new");
    await page.fill('textarea[name="subject"]', "Test ticket from e2e");
    await page.fill('textarea[name="description"]', "Automated test coverage");
    await page.selectOption('select[name="priority"]', "medium");
    await page.click("button=Create Ticket");
    await expect(page.locator("text=Ticket created")).toBeVisible();
  });

  test("support can add initial message", async ({ page }) => {
    await page.goto("/support/tickets/1/messages");
    await page.fill(
      'textarea[placeholder="Add a message..."]',
      "Initial message from automated test",
    );
    await page.click("button=Send");
    await expect(page.locator("text=Message sent")).toBeVisible();
  });
});
