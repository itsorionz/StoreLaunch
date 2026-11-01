import "dotenv/config";
import { db } from "../lib/db";
import { seedDemoOperations } from "../lib/seed-demo-data";
import { seedOperationsFixtures } from "../lib/seed-operations";
import { seedHrm } from "../lib/seed-hrm";
import {
  seedAdmin,
  seedCatalog,
  seedSalesRep,
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
  console.log("Seeding catalog...");
  await seedCatalog(db);
  console.log("Seeding admin user (admin@store.local / admin1234)...");
  await seedAdmin(db);
  console.log("Seeding warehouse keeper (warehouse@store.local / keeper1234)...");
  await seedWarehouseKeeper(db);
  console.log("Seeding sales rep (sales@store.local / sales1234)...");
  await seedSalesRep(db);
  console.log("Seeding customer service (support@store.local / support1234)...");
  await seedCustomerService(db);
  console.log("Seeding manager (manager@store.local / manager1234)...");
  await seedManager(db);
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
