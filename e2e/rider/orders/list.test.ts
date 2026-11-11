import { test, expect } from "@playwright/test";

test.describe("Rider Order List", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login?callbackUrl=/rider");
    await page.fill('[name="email"]', "rider@test.com");
    await page.fill('[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.goto("/rider");
  });

  test("rider can view order list", async ({ page }) => {
    await expect(page.locator("text=Orders")).toBeVisible();
    await expect.poll(() => page.locator("tr").count()).toBeGreaterThan(0);
  });

  test("rider can view order detail", async ({ page }) => {
    await page.goto("/rider");
    await page.click("text=#12345"); // click order link
    await page.waitForURL(/\/rider\/orders\/12345/);
    await expect(page.locator("text=Order Detail")).toBeVisible();
  });

  test("rider can record proof of delivery", async ({ page }) => {
    await page.goto("/rider/orders/12345/proof");
    await page.fill('input[name="cashReceived"]', "500");
    await page.click("button=Submit");
    await expect(page.locator("text=Proof recorded")).toBeVisible();
  });

  test("rider can record delivery attempt", async ({ page }) => {
    await page.goto("/rider/orders/12345/attempt");
    await page.selectOption('select[name="issue"]', "delay");
    await page.fill('input[name="note"]', "Customer not available");
    await page.click("button=Submit");
    await expect(page.locator("text=Attempt recorded")).toBeVisible();
  });
});
