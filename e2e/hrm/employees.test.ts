import { test, expect } from "@playwright/test";

test.describe("HRM Employee Management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/hrm");
    await page.fill('[name="email"]', "hr@test.com");
    await page.fill('[name="password"]', "hr123");
    await page.click('button[type="submit"]');
    await page.goto("/hrm");
  });

  test("hr can view employee list", async ({ page }) => {
    await page.goto("/hrm/employees");
    await expect(page.locator("text=Employees")).toBeVisible();
  });

  test("hr can view attendance", async ({ page }) => {
    await page.goto("/hrm/attendance");
    await expect(page.locator("text=Attendance")).toBeVisible();
  });

  test("hr can view payroll", async ({ page }) => {
    await page.goto("/hrm/payroll");
    await expect(page.locator("text=Payroll")).toBeVisible();
  });
});
