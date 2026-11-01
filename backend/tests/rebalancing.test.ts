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
  const name = `test_rebal_${randomUUID().replaceAll("-", "")}`;
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
    const { suggestRebalancingTransfers } = await import("../lib/rebalancing");

    const category = await db.category.create({ data: { name: "Rebal", slug: "rebal" } });
    const hub = await db.warehouse.create({
      data: { name: "Surplus WH", code: "SUR", isDefault: true },
    });
    const low = await db.warehouse.create({ data: { name: "Demand WH", code: "DEM" } });
    const retired = await db.warehouse.create({
      data: { name: "Retired WH", code: "RET", active: false },
    });

    // Product 1: global reorderPoint fallback + real sales velocity at the
    // destination (30 units / 30 days = 1/day → cover target = COVER_DAYS).
    const p1 = await db.product.create({
      data: {
        name: "Velocity item",
        slug: "velocity-item",
        categoryId: category.id,
        priceCents: 1000,
        stock: 22,
        reorderPoint: 3,
      },
    });
    await db.stockLevel.create({ data: { warehouseId: hub.id, productId: p1.id, qty: 20 } });
    await db.stockLevel.create({ data: { warehouseId: low.id, productId: p1.id, qty: 2 } });
    // Inactive warehouses never donate stock.
    await db.stockLevel.create({ data: { warehouseId: retired.id, productId: p1.id, qty: 500 } });
    await db.stockMovement.create({
      data: {
        warehouseId: low.id,
        productId: p1.id,
        delta: -30,
        reason: "Sale",
        reasonCode: "Sale",
        actorId: "test",
      },
    });

    // Product 2: per-warehouse minStock override beats the global reorder
    // point; no velocity, so the target is just the threshold.
    const p2 = await db.product.create({
      data: {
        name: "Threshold item",
        slug: "threshold-item",
        categoryId: category.id,
        priceCents: 500,
        stock: 18,
        reorderPoint: 1,
      },
    });
    await db.stockLevel.create({ data: { warehouseId: hub.id, productId: p2.id, qty: 15 } });
    await db.stockLevel.create({
      data: { warehouseId: low.id, productId: p2.id, qty: 8, minStock: 10 },
    });

    // Product 3: only one warehouse holds it — no cross-warehouse suggestion.
    const p3 = await db.product.create({
      data: {
        name: "Single site item",
        slug: "single-site-item",
        categoryId: category.id,
        priceCents: 200,
        stock: 1,
        reorderPoint: 5,
      },
    });
    await db.stockLevel.create({ data: { warehouseId: low.id, productId: p3.id, qty: 1 } });

    await test("suggestions move the smallest quantity that closes a velocity-based deficit", async () => {
      const suggestions = await suggestRebalancingTransfers();
      const forP1 = suggestions.filter((s) => s.productId === p1.id);
      assert.equal(forP1.length, 1);
      const suggestion = forP1[0];
      // Destination sold 30 units in the 30-day window → 1/day → target
      // max(reorderPoint 3, cover 7) = 7; holding 2 → deficit 5.
      assert.equal(suggestion.qty, 5);
      assert.equal(suggestion.from.warehouseId, hub.id);
      assert.equal(suggestion.to.warehouseId, low.id);
      assert.equal(suggestion.velocityPerDay, 1);
      // The inactive warehouse's 500 units are not a donation source.
      assert.notEqual(suggestion.from.warehouseId, retired.id);
    });

    await test("per-warehouse minStock overrides the global reorder point", async () => {
      const suggestion = (await suggestRebalancingTransfers()).find((s) => s.productId === p2.id);
      assert.ok(suggestion);
      // minStock 10, no sales → target 10, holding 8 → deficit 2.
      assert.equal(suggestion.qty, 2);
      assert.equal(suggestion.velocityPerDay, 0);
      assert.equal(suggestion.to.warehouseId, low.id);
    });

    await test("single-warehouse products and balanced stock produce no suggestions", async () => {
      const suggestions = await suggestRebalancingTransfers();
      assert.equal(
        suggestions.some((s) => s.productId === p3.id),
        false,
      );

      // Bring the deficit warehouse up to target → nothing left to move.
      await db.stockLevel.update({
        where: { warehouseId_productId: { warehouseId: low.id, productId: p1.id } },
        data: { qty: 10 },
      });
      await db.stockLevel.update({
        where: { warehouseId_productId: { warehouseId: low.id, productId: p2.id } },
        data: { qty: 10 },
      });
      const after = await suggestRebalancingTransfers();
      assert.equal(
        after.some((s) => s.productId === p1.id || s.productId === p2.id),
        false,
      );
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
