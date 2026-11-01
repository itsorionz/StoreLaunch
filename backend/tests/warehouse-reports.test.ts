import { config } from "dotenv";
import { createPrismaClient } from "../lib/prisma-client";
import { PrismaClient } from "@backend/generated/prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { Roles } from "../lib/enums.mjs";

config({ quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Local database required");
  const name = `test_warehouse_reports_${randomUUID().replaceAll("-", "")}`;
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
    const { getWarehouseCards, getReorderReport } = await import("../lib/ops-intelligence");

    await db.user.create({
      data: {
        name: "Warehouse Admin",
        email: "admin@warehouse.invalid",
        passwordHash: "unused",
        roles: [Roles.Admin],
      },
    });
    const warehouse = await db.warehouse.create({
      data: { name: "Main Warehouse", code: "MAIN", isDefault: true },
    });
    const category = await db.category.create({ data: { name: "Stock", slug: "stock" } });

    const productA = await db.product.create({
      data: {
        name: "Widget A",
        slug: "widget-a",
        categoryId: category.id,
        priceCents: 1000,
        costCents: 500,
        stock: 100,
        sku: "WIDGET-A",
        reorderPoint: 10,
      },
    });
    const productB = await db.product.create({
      data: {
        name: "Widget B",
        slug: "widget-b",
        categoryId: category.id,
        priceCents: 2000,
        costCents: 1500,
        stock: 5,
        sku: "WIDGET-B",
        reorderPoint: 10,
      },
    });

    await db.stockLevel.create({
      data: { warehouseId: warehouse.id, productId: productA.id, qty: 100 },
    });
    await db.stockLevel.create({
      data: { warehouseId: warehouse.id, productId: productB.id, qty: 5 },
    });

    await test("warehouse cards return correct stock value", async () => {
      const cards = await getWarehouseCards(warehouse.id);
      assert.ok(cards.stockValueCents > 0);
      assert.strictEqual(cards.lowStockCount >= 0, true);
    });

    await test("dead stock detected for unmoved products", async () => {
      const cards = await getWarehouseCards(warehouse.id);
      assert.ok(cards.deadStockQty > 0);
    });

    await test("low stock detection works", async () => {
      const cards = await getWarehouseCards(warehouse.id);
      assert.strictEqual(cards.lowStockCount, 1);
    });

    await test("shrinkage counts unexplained losses at cost", async () => {
      const admin = await db.user.findFirst({ where: { email: "admin@warehouse.invalid" } });
      assert.ok(admin);
      // Stocktake shortage: −3 units of productA (cost 500) = 1500 lost.
      await db.stockMovement.create({
        data: {
          warehouseId: warehouse.id,
          productId: productA.id,
          delta: -3,
          reason: "Stocktake",
          reasonCode: "Stocktake",
          actorId: admin.id,
        },
      });
      // Manual write-off (damage): −1 unit of productB (cost 1500) = 1500 lost.
      await db.stockMovement.create({
        data: {
          warehouseId: warehouse.id,
          productId: productB.id,
          delta: -1,
          reason: "Damaged in transit",
          reasonCode: null,
          actorId: admin.id,
        },
      });
      // Business flows never count as shrinkage: a sale outflow and a transfer out.
      for (const reasonCode of ["Sale", "Transfer"]) {
        await db.stockMovement.create({
          data: {
            warehouseId: warehouse.id,
            productId: productA.id,
            delta: -2,
            reason: reasonCode,
            reasonCode,
            actorId: admin.id,
          },
        });
      }

      const cards = await getWarehouseCards(warehouse.id);
      assert.equal(cards.shrinkageCents, 1500 + 1500);
    });

    await test("reorder report uses per-warehouse thresholds with global fallback", async () => {
      const satellite = await db.warehouse.create({
        data: { name: "Satellite WH", code: "SAT" },
      });
      // minStock override (12) beats the global reorderPoint (10).
      await db.stockLevel.create({
        data: { warehouseId: satellite.id, productId: productB.id, qty: 7, minStock: 12 },
      });

      const report = await getReorderReport();
      const mainRow = report.find(
        (r) => r.productId === productB.id && r.warehouseId === warehouse.id,
      );
      assert.ok(mainRow);
      // No minStock at MAIN → the global reorderPoint (10) applies; 5 on hand → order 5.
      assert.equal(mainRow.reorderPoint, 10);
      assert.equal(mainRow.suggestedQty, 5);
      assert.equal(mainRow.warehouseName, "Main Warehouse");

      const satelliteRow = report.find(
        (r) => r.productId === productB.id && r.warehouseId === satellite.id,
      );
      assert.ok(satelliteRow);
      assert.equal(satelliteRow.reorderPoint, 12);
      assert.equal(satelliteRow.suggestedQty, 5);

      // productA is above its reorder point everywhere → never listed.
      assert.equal(
        report.some((r) => r.productId === productA.id),
        false,
      );
    });

    await test("reorder report exports as supplier-ready CSV", async () => {
      const { reorderReportToCsv, reorderCsvFilename } = await import("../lib/reorder-csv");
      // A name that must be escaped under RFC 4180 (comma + quotes).
      const tricky = await db.product.create({
        data: {
          name: 'Kit, "Pro"',
          slug: "kit-pro",
          categoryId: category.id,
          priceCents: 300,
          stock: 1,
          sku: "KIT-C",
          reorderPoint: 5,
        },
      });
      await db.stockLevel.create({
        data: { warehouseId: warehouse.id, productId: tricky.id, qty: 1 },
      });

      const report = await getReorderReport();
      const csv = reorderReportToCsv(report);

      assert.equal(
        csv.split("\r\n")[0],
        "Product,SKU,Warehouse,Warehouse Code,Current Stock,Reorder Point,Suggested Qty,Bin",
      );
      assert.ok(csv.endsWith("\r\n"));
      // CRLF everywhere — no bare LF that would break spreadsheet imports.
      assert.equal(/(^|[^\r])\n/.test(csv), false);

      const lines = csv.split("\r\n").filter(Boolean);
      assert.equal(lines.length, report.length + 1);
      // One data line per suggestion, values in header order, bin last.
      assert.ok(lines.includes('"Kit, ""Pro""",KIT-C,Main Warehouse,MAIN,1,5,4,'));
      const widgetLine = lines.find((line) => line.includes("WIDGET-B"));
      assert.ok(widgetLine);
      assert.equal(widgetLine, "Widget B,WIDGET-B,Main Warehouse,MAIN,5,10,5,");
      const satelliteLine = lines.find((line) => line.includes("WIDGET-B") && line.includes("SAT"));
      assert.equal(satelliteLine, "Widget B,WIDGET-B,Satellite WH,SAT,7,12,5,");

      assert.equal(reorderCsvFilename("2026-10-29"), "reorder-2026-10-29.csv");
    });
  } finally {
    await store?.$disconnect();
    await adminDb.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);
    await adminDb.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
