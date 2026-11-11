import { test, expect } from "@playwright/test";

test.describe("Support Full Queue Workflow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/support");
    await page.fill('[name="email"]', "support@test.com");
    await page.fill('[name="password"]', "support123");
    await page.click('button[type="submit"]');
    await page.goto("/support");
  });

  test("support can filter tickets by priority", async ({ page }) => {
    await page.goto("/support/tickets?priority=high");
    await expect(page.locator("text=High Priority")).toBeVisible();
  });

  test("support can resolve a ticket", async ({ page }) => {
    await page.goto("/support/tickets/1");
    await page.selectOption('select[name="status"]', "resolved");
    await page.fill(
      'textarea[placeholder="Resolution note"]',
      "Issue resolved per customer discussion",
    );
    await page.click("button=Resolve");
    await expect(page.locator("text=Ticket resolved")).toBeVisible();
  });

  test("support can assign ticket to team", async ({ page }) => {
    await page.goto("/support/tickets/1/assign");
    await page.selectOption('select[name="assignee"]', "team-member-2");
    await page.click("button=Assign");
    await expect(page.locator("text=Ticket assigned")).toBeVisible();
  });

  test("support can view ticket history", async ({ page }) => {
    await page.goto("/support/tickets/1/history");
    await expect(page.locator("text=History")).toBeVisible();
  });
});
