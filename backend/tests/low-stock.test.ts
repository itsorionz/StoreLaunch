import { config } from "dotenv";
import { createPrismaClient } from "../lib/prisma-client";
import { PrismaClient } from "@backend/generated/prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";

config({ quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Local database required");
  const name = `test_lowstock_${randomUUID().replaceAll("-", "")}`;
  const adminDb = createPrismaClient();
  await adminDb.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  let store: PrismaClient | undefined;
  try {
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      env: process.env,
      stdio: "pipe",
    });
    const { db } = await import("../lib/db");
    store = db;
    const { getLowStockAlerts } = await import("../lib/low-stock");

    const category = await db.category.create({ data: { name: "LowStock", slug: "lowstock" } });
    const dhaka = await db.warehouse.create({
      data: { name: "Dhaka WH", code: "DHK", isDefault: true },
    });
    const chattogram = await db.warehouse.create({
      data: { name: "Chattogram WH", code: "CGP" },
    });

    // p1: global reorderPoint fallback — 2 <= 5 → Low at Dhaka, fine elsewhere.
    const p1 = await db.product.create({
      data: {
        name: "Fallback item",
        slug: "fallback-item",
        categoryId: category.id,
        priceCents: 1000,
        stock: 12,
        reorderPoint: 5,
      },
    });
    await db.stockLevel.create({ data: { warehouseId: dhaka.id, productId: p1.id, qty: 2 } });
    await db.stockLevel.create({ data: { warehouseId: chattogram.id, productId: p1.id, qty: 10 } });

    // p2: per-warehouse minStock override — 0 at Chattogram → Out; the
    // override (3) beats the global reorderPoint (1). Dhaka holds 4 > 3 → fine.
    const p2 = await db.product.create({
      data: {
        name: "Override item",
        slug: "override-item",
        categoryId: category.id,
        priceCents: 500,
        stock: 4,
        reorderPoint: 1,
      },
    });
    await db.stockLevel.create({
      data: { warehouseId: chattogram.id, productId: p2.id, qty: 0, minStock: 3 },
    });
    await db.stockLevel.create({ data: { warehouseId: dhaka.id, productId: p2.id, qty: 4 } });

    // p3: no reorder policy anywhere → never flagged.
    const p3 = await db.product.create({
      data: {
        name: "No policy item",
        slug: "no-policy-item",
        categoryId: category.id,
        priceCents: 200,
        stock: 1,
      },
    });
    await db.stockLevel.create({ data: { warehouseId: dhaka.id, productId: p3.id, qty: 1 } });

    // p4: inactive products are excluded from alerts.
    const p4 = await db.product.create({
      data: {
        name: "Retired item",
        slug: "retired-item",
        categoryId: category.id,
        priceCents: 100,
        stock: 0,
        reorderPoint: 5,
        active: false,
      },
    });
    await db.stockLevel.create({ data: { warehouseId: dhaka.id, productId: p4.id, qty: 0 } });

    await test("alerts flag zeroed rows as Out and at-threshold rows as Low", async () => {
      const alerts = await getLowStockAlerts();
      const forP1 = alerts.find((a) => a.productId === p1.id);
      assert.ok(forP1);
      assert.equal(forP1.severity, "Low");
      assert.equal(forP1.qty, 2);
      assert.equal(forP1.threshold, 5);
      assert.equal(forP1.warehouseId, dhaka.id);
      assert.equal(forP1.warehouseName, "Dhaka WH");

      const forP2 = alerts.find((a) => a.productId === p2.id);
      assert.ok(forP2);
      assert.equal(forP2.severity, "Out");
      assert.equal(forP2.qty, 0);
      // minStock override (3) wins over global reorderPoint (1).
      assert.equal(forP2.threshold, 3);
      assert.equal(forP2.warehouseId, chattogram.id);
    });

    await test("zero-threshold and inactive products never appear in alerts", async () => {
      const alerts = await getLowStockAlerts();
      assert.equal(
        alerts.some((a) => a.productId === p3.id),
        false,
      );
      assert.equal(
        alerts.some((a) => a.productId === p4.id),
        false,
      );
    });

    await test("alerts scope to one warehouse when requested", async () => {
      const dhakaAlerts = await getLowStockAlerts(dhaka.id);
      assert.deepEqual(
        dhakaAlerts.map((a) => a.productId),
        [p1.id],
      );
      const chattogramAlerts = await getLowStockAlerts(chattogram.id);
      assert.deepEqual(
        chattogramAlerts.map((a) => a.productId),
        [p2.id],
      );

      // Restocking the warehouse clears its alerts.
      await db.stockLevel.update({
        where: { warehouseId_productId: { warehouseId: dhaka.id, productId: p1.id } },
        data: { qty: 6 },
      });
      assert.equal((await getLowStockAlerts(dhaka.id)).length, 0);
    });
  } finally {
    if (store) await store.$disconnect();
    await adminDb.$executeRawUnsafe(`DROP DATABASE "${name}"`);
    await adminDb.$disconnect();
  }
}

main().then(
  () => void 0,
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
