import { test, expect } from "@playwright/test";

test.describe("HRM Attendance Full Tracking", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/hrm/attendance");
    await page.fill('[name="email"]', "hr@test.com");
    await page.fill('[name="password"]', "hr123");
    await page.click('button[type="submit"]');
    await page.goto("/hrm/attendance");
  });

  test("hr can mark employee attendance present", async ({ page }) => {
    await page.goto("/hrm/attendance/mark");
    await page.selectOption('select[name="employee"]', "EMP-001");
    await page.selectOption('select[name="status"]', "present");
    await page.fill('textarea[name="notes"]', "On time");
    await page.click("button=Mark Attendance");
    await expect(page.locator("text=Attendance marked")).toBeVisible();
  });

  test("hr can view attendance history", async ({ page }) => {
    await page.goto("/hrm/attendance/history");
    await expect(page.locator("text=Attendance History")).toBeVisible();
  });

  test("hr can view attendance reports", async ({ page }) => {
    await page.goto("/hrm/attendance/reports");
    await expect(page.locator("text=Attendance Reports")).toBeVisible();
  });
});
