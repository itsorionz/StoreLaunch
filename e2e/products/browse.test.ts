import { test, expect } from "@playwright/test";

test.describe("Product Categories & Browsing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("customer can browse by category", async ({ page }) => {
    await page.click("text=All Categories");
    await page.click("text=Electronics");
    await expect(page.locator("text=Electronics")).toBeVisible();
  });

  test("customer can view product detail", async ({ page }) => {
    await page.goto("/products/1");
    await expect(page.locator("text=Product Detail")).toBeVisible();
  });

  test("customer can view featured products", async ({ page }) => {
    await page.goto("/products/featured");
    await expect(page.locator("text=Featured")).toBeVisible();
  });
});
