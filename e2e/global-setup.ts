import { test, expect } from "@playwright/test";
import { createPrismaClient } from "../backend/lib/prisma-client";
import { Roles } from "../backend/lib/enums.mjs";

test.beforeAll(async () => {
  const prisma = createPrismaClient();
  await prisma.user.createMany({
    skipDuplicates: true,
    data: [
      {
        email: "rider@test.com",
        name: "Test Rider",
        roles: [Roles.Rider],
        passwordHash: "not-a-real-hash",
      },
      {
        email: "admin@test.com",
        name: "Test Admin",
        roles: [Roles.Admin],
        passwordHash: "not-a-real-hash",
      },
    ],
  });
  await prisma.$disconnect();
});

test.beforeEach(async ({ page }, testInfo) => {
  const isAdmin = testInfo.file.includes("admin");
  const user = isAdmin ? "admin@test.com" : "rider@test.com";
  const password = isAdmin ? "admin123" : "password123";

  await page.goto("/login");
  await page.fill('[name="email"]', user);
  await page.fill('[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(isAdmin ? "/admin" : "/rider");
  await expect(page).toHaveURL(isAdmin ? "/admin" : "/rider");
});
