import { test, expect } from "@playwright/test";

test.describe("HRM Payroll Processing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/hrm/payroll");
    await page.fill('[name="email"]', "hr@test.com");
    await page.fill('[name="password"]', "hr123");
    await page.click('button[type="submit"]');
    await page.goto("/hrm/payroll");
  });

  test("hr can process payrun", async ({ page }) => {
    await page.goto("/hrm/payroll/process");
    await page.fill('input[name="payrunDate"]', "2024-12-15");
    await page.selectOption('select[name="employee"]', "EMP-001");
    await page.click("button=Process Payroll");
    await expect(page.locator("text=Payrun processed")).toBeVisible();
  });

  test("hr can view payslips", async ({ page }) => {
    await page.goto("/hrm/payroll/payslips");
    await expect(page.locator("text=Payslips")).toBeVisible();
  });

  test("hr can view payroll history", async ({ page }) => {
    await page.goto("/hrm/payroll/history");
    await expect(page.locator("text=Payroll History")).toBeVisible();
  });
});
