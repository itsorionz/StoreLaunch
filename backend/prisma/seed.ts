import "dotenv/config";
import bcrypt from "bcryptjs";
import { generateLicenseKey, hashLicenseKey } from "../lib/license";
import { db } from "../lib/db";
import { seedDemoOperations } from "../lib/seed-demo-data";
import { seedOperationsFixtures } from "../lib/seed-operations";
import { seedHrm } from "../lib/seed-hrm";
import {
  seedAdmin,
  seedCatalog,
  seedCustomer,
  seedSalesRep,
  seedSuperAdmin,
  seedWarehouseKeeper,
  seedCustomerService,
  seedManager,
} from "../lib/seed-data";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Demo seeding is disabled in production. Use store setup and manage the live catalog in admin.",
    );
  }
  const settings = await db.storeSettings.findUnique({ where: { singletonKey: 1 } });
  await db.storeSettings.upsert({
    where: { singletonKey: 1 },
    update: {
      setupCompletedAt: settings?.setupCompletedAt ?? new Date(),
      ...(settings?.storeName === "My Store" ? { storeName: "StoreLaunch Pantry" } : {}),
    },
    create: {
      storeName: "StoreLaunch Pantry",
      currencySymbol: "৳",
      currencyCode: "BDT",
      language: "en",
      setupCompletedAt: new Date(),
    },
  });

  // Rename existing dev users to new storelaunch.com emails and update passwords
  const emailRenames: Array<{ from: string; to: string }> = [
    { from: "owner@store.local", to: "superadmin@storelaunch.com" },
    { from: "admin@store.local", to: "admin@store.storelaunch.com" },
    { from: "manager@store.local", to: "manager@store.storelaunch.com" },
    { from: "warehouse@store.local", to: "warehouse@store.storelaunch.com" },
    { from: "keeper@store.local", to: "warehouse@store.storelaunch.com" },
    { from: "sales@store.local", to: "sales@store.storelaunch.com" },
    { from: "support@store.local", to: "support@store.storelaunch.com" },
  ];
  for (const { from, to } of emailRenames) {
    const existing = await db.user.findUnique({ where: { email: from } });
    if (existing) {
      const already = await db.user.findUnique({ where: { email: to } });
      if (already && already.id !== existing.id) {
        await db.user.delete({ where: { id: existing.id } });
      } else {
        await db.user.update({
          where: { id: existing.id },
          data: { email: to, passwordHash: await bcrypt.hash("#SuperAdmin@2026#", 10) },
        });
      }
    }
  }
  console.log("Seeding catalog...");
  await seedCatalog(db);
  console.log("Seeding admin user (admin@store.storelaunch.com / #SuperAdmin@2026#)...");
  await seedAdmin(db);
  console.log("Seeding demo license key for admin...");
  await seedDemoLicense(db);
  console.log("Seeding super admin (superadmin@storelaunch.com / #SuperAdmin@2026#)...");
  await seedSuperAdmin(db);
  console.log("Seeding warehouse keeper (warehouse@store.storelaunch.com / #SuperAdmin@2026#)...");
  await seedWarehouseKeeper(db);
  console.log("Seeding sales rep (sales@store.storelaunch.com / #SuperAdmin@2026#)...");
  await seedSalesRep(db);
  console.log("Seeding customer service (support@store.storelaunch.com / #SuperAdmin@2026#)...");
  await seedCustomerService(db);
  console.log("Seeding manager (manager@store.storelaunch.com / #SuperAdmin@2026#)...");
  await seedManager(db);
  console.log("Seeding customer (customer@store.storelaunch.com / #SuperAdmin@2026#)...");
  await seedCustomer(db);
  console.log("Seeding demo customer, rider, order and operations workflows...");
  await seedDemoOperations(db);
  console.log("Seeding warehouses, stock, zones, shipments, transfers and purchasing...");
  await seedOperationsFixtures(db);
  console.log("Seeding HRM employees, attendance, leave, payroll, reviews and documents...");
  await seedHrm(db);
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

async function seedDemoLicense(prisma: typeof db) {
  const { key } = await generateLicenseKey({ expiresInDays: 365 });
  const keyHash = await hashLicenseKey(key);
  const adminUser = await prisma.user.findUnique({
    where: { email: "admin@store.storelaunch.com" },
  });
  if (!adminUser) return;
  await prisma.license.upsert({
    where: { keyHash },
    create: {
      keyHash,
      storeSlug: null,
      expiresAt: new Date(Date.now() + 365 * 86400_000),
      activatedAt: new Date(),
    },
    update: {},
  });
  console.log("Demo license key for admin:", key);
}
