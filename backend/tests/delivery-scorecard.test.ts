import { config } from "dotenv";
import { createPrismaClient } from "../lib/prisma-client";
import { PrismaClient } from "@backend/generated/prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { Roles, PaymentMethods } from "../lib/enums.mjs";

config({ quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Local database required");
  const name = `test_delivery_scorecard_${randomUUID().replaceAll("-", "")}`;
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
    const { getDeliveryScorecard } = await import("../lib/ops-intelligence");

    const deliveryCompany = await db.deliveryCompany.create({
      data: { name: "Test Courier", phone: "01700000001" },
    });
    const deliveryZone = await db.deliveryZone.create({
      data: {
        name: "Dhaka City",
        areas: ["Dhaka"],
        mode: "Courier",
        deliveryCompanyId: deliveryCompany.id,
        rateCents: 60,
        codFeeCents: 20,
        etaDaysFrom: 1,
        etaDaysTo: 2,
        active: true,
      },
    });
    const customer = await db.user.create({
      data: {
        name: "Test Customer",
        email: "customer@delivery.invalid",
        passwordHash: "unused",
        roles: [Roles.Customer],
      },
    });
    const category = await db.category.create({
      data: { name: "Test Category", slug: "test-category" },
    });
    const product = await db.product.create({
      data: {
        name: "Test Product",
        slug: "test-product",
        priceCents: 1000,
        stock: 100,
        sku: "TEST-PROD",
        categoryId: category.id,
      },
    });

    // Create delivered orders
    for (let i = 0; i < 10; i++) {
      const order = await db.order.create({
        data: {
          number: `ORD-${i}`,
          status: "Delivered",
          subtotalCents: 1000,
          shippingCents: 60,
          totalCents: 1060,
          currencyCode: "BDT",
          currencySymbol: "৳",
          paymentMethod: PaymentMethods.COD,
          recipientName: "Customer",
          phone: "01700000000",
          line1: "Test Address",
          city: "Dhaka",
          zoneId: deliveryZone.id,
          deliveryCompanyId: deliveryCompany.id,
          userId: customer.id,
          createdAt: new Date(Date.now() - i * 86400000),
          shippedAt: new Date(Date.now() - i * 86400000 + 12 * 3600000),
          deliveredAt: new Date(Date.now() - i * 86400000 + 24 * 3600000),
          items: {
            create: {
              productId: product.id,
              name: product.name,
              slug: product.slug,
              priceCents: product.priceCents,
              quantity: 1,
            },
          },
        },
      });
      await db.shipment.create({
        data: {
          orderId: order.id,
          deliveryCompanyId: deliveryCompany.id,
          trackingNumber: `TRK-${i}`,
          status: "Delivered",
          providerMode: "Manual",
          costCents: 450,
        },
      });
    }

    // Returned-to-origin orders: half the delivered count, at a higher
    // per-parcel cost, so both the RTO % and cost/parcel math are observable.
    for (let i = 0; i < 5; i++) {
      const order = await db.order.create({
        data: {
          number: `ORD-RTO-${i}`,
          status: "ReturningToOrigin",
          subtotalCents: 1000,
          shippingCents: 60,
          totalCents: 1060,
          currencyCode: "BDT",
          currencySymbol: "৳",
          paymentMethod: PaymentMethods.COD,
          recipientName: "Customer",
          phone: "01700000000",
          line1: "Test Address",
          city: "Dhaka",
          zoneId: deliveryZone.id,
          deliveryCompanyId: deliveryCompany.id,
          userId: customer.id,
          createdAt: new Date(Date.now() - i * 86400000),
          shippedAt: new Date(Date.now() - i * 86400000 + 12 * 3600000),
          items: {
            create: {
              productId: product.id,
              name: product.name,
              slug: product.slug,
              priceCents: product.priceCents,
              quantity: 1,
            },
          },
        },
      });
      await db.shipment.create({
        data: {
          orderId: order.id,
          deliveryCompanyId: deliveryCompany.id,
          trackingNumber: `TRK-RTO-${i}`,
          status: "Returned",
          providerMode: "Manual",
          costCents: 600,
        },
      });
    }

    await test("delivery scorecard returns correct metrics", async () => {
      const scorecard = await getDeliveryScorecard();
      assert.ok(scorecard.totalDeliveries >= 10);
      assert.ok(scorecard.firstAttemptDeliveryPercent >= 0);
      assert.ok(scorecard.avgOrderToDeliveryDays >= 0);
      assert.ok(scorecard.onTimeHandoverPercent >= 0);
      assert.ok(scorecard.codReceivableCents >= 0);
    });

    await test("RTO % uses finished deliveries as the denominator", async () => {
      const scorecard = await getDeliveryScorecard();
      // 5 RTO out of 15 finished (10 delivered + 5 returning) — a delivered-only
      // denominator would have reported 0%.
      assert.ok(
        Math.abs(scorecard.rtoPercent - (5 / 15) * 100) < 0.01,
        `expected ~33.33%, got ${scorecard.rtoPercent}`,
      );
    });

    await test("cost/parcel averages persisted carrier quotes", async () => {
      const scorecard = await getDeliveryScorecard();
      // (10 × 450 + 5 × 600) / 15 = 500 — unquoted shipments must not drag it down.
      assert.equal(scorecard.costPerParcel, 500);

      const carrier = scorecard.deliveryByCarrier.find((row) => row.name === "Test Courier");
      assert.ok(carrier);
      assert.ok(
        Math.abs(carrier.rtoPercent - (5 / 15) * 100) < 0.01,
        `expected ~33.33% per carrier, got ${carrier.rtoPercent}`,
      );
      assert.equal(carrier.costPerParcelCents, 500);
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
