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
  const name = `test_hubs_${randomUUID().replaceAll("-", "")}`;
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
    const { assignDeliveryHub } = await import("../lib/hub-routing");
    const { routeOrderToWarehouse } = await import("../lib/order-routing");
    const { createSalesOrder } = await import("../lib/sales-orders");

    const category = await db.category.create({ data: { name: "Hubs", slug: "hubs" } });
    const product = await db.product.create({
      data: {
        name: "Hub item",
        slug: "hub-item",
        categoryId: category.id,
        priceCents: 1000,
        stock: 40,
      },
    });
    const warehouseA = await db.warehouse.create({
      data: { name: "Dhaka Main", code: "DHK", city: "Dhaka", isDefault: true },
    });
    const warehouseB = await db.warehouse.create({
      data: { name: "South Hub WH", code: "STH" },
    });
    await db.stockLevel.create({
      data: { warehouseId: warehouseA.id, productId: product.id, qty: 20 },
    });
    await db.stockLevel.create({
      data: { warehouseId: warehouseB.id, productId: product.id, qty: 20 },
    });
    const customer = await db.user.create({
      data: {
        name: "Hub Buyer",
        email: "hub-buyer@hub.invalid",
        phone: "01799990001",
        passwordHash: "unused",
        roles: [Roles.Customer],
      },
    });
    const salesRep = await db.user.create({
      data: {
        name: "Hub Rep",
        email: "hub-rep@hub.invalid",
        phone: "01799990002",
        passwordHash: "unused",
        roles: [Roles.Sales],
      },
    });
    const actor = { id: salesRep.id, name: salesRep.name, role: Roles.Sales };

    // Fills a hub's daily capacity with an order assigned to it.
    async function fillHub(hubId: string) {
      await db.order.create({
        data: {
          number: `SL-HUB-${randomUUID().slice(0, 10).toUpperCase()}`,
          subtotalCents: 0,
          totalCents: 0,
          currencyCode: "BDT",
          currencySymbol: "৳",
          recipientName: "Capacity Filler",
          phone: "01700000000",
          line1: "Street 1",
          city: "Dhaka",
          userId: customer.id,
          deliveryHubId: hubId,
        },
      });
    }

    // Fixtures are shared across tests; capacity-sensitive hubs are only ever
    // filled by the test that owns them.
    const hubDhaka1 = await db.deliveryHub.create({
      data: {
        name: "Dhanmondi",
        code: "DHK-DHN",
        city: "Dhaka",
        capacity: 1,
        warehouseId: warehouseA.id,
      },
    });
    const hubDhaka2 = await db.deliveryHub.create({
      data: {
        name: "Gulshan",
        code: "DHK-GLS",
        city: "Dhaka",
        capacity: 1,
        warehouseId: warehouseA.id,
      },
    });
    const hubKhulna = await db.deliveryHub.create({
      data: { name: "Khulna Point", code: "KHL-PT", city: "Khulna" },
    });
    const hubSouth1 = await db.deliveryHub.create({
      data: { name: "South Desk 1", code: "STH-1", capacity: 1, warehouseId: warehouseB.id },
    });
    const hubSouth2 = await db.deliveryHub.create({
      data: { name: "South Desk 2", code: "STH-2", capacity: 1, warehouseId: warehouseB.id },
    });
    // Standalone counter desk: not part of any warehouse's fallback pool, so
    // other zones can never borrow its capacity.
    const hubPos = await db.deliveryHub.create({
      data: { name: "POS Counter Desk", code: "POS-1", capacity: 1 },
    });

    await test("auto-assignment matches the delivery city and skips hubs at daily capacity", async () => {
      const first = await assignDeliveryHub(db, { city: "Dhaka" });
      assert.equal(first.deliveryHubId, hubDhaka1.id);
      assert.equal(first.atCapacity, false);

      await fillHub(hubDhaka1.id);
      const skipped = await assignDeliveryHub(db, { city: "Dhaka" });
      assert.equal(skipped.deliveryHubId, hubDhaka2.id);

      const khulna = await assignDeliveryHub(db, { city: "Khulna" });
      assert.equal(khulna.deliveryHubId, hubKhulna.id);

      // No hub serves this city and no warehouse mapping applies, so nothing
      // is assigned rather than borrowing another city's pickup point.
      const none = await assignDeliveryHub(db, { city: "Rangpur" });
      assert.equal(none.deliveryHubId, null);
      assert.equal(none.atCapacity, false);
    });

    await test("a zone-pinned hub falls back to warehouse alternatives and then reports capacity", async () => {
      const zone = await db.deliveryZone.create({
        data: {
          name: "South pinned",
          warehouseId: warehouseB.id,
          deliveryHubId: hubSouth1.id,
        },
      });

      const assigned = await assignDeliveryHub(db, {
        zoneId: zone.id,
        warehouseId: warehouseB.id,
      });
      assert.equal(assigned.deliveryHubId, hubSouth1.id);
      assert.equal(assigned.atCapacity, false);

      // Pinned hub full → same-warehouse alternative takes the parcel.
      await fillHub(hubSouth1.id);
      const fallback = await assignDeliveryHub(db, {
        zoneId: zone.id,
        warehouseId: warehouseB.id,
      });
      assert.equal(fallback.deliveryHubId, hubSouth2.id);
      assert.equal(fallback.atCapacity, false);

      // Pinned hub full and every alternative full → capacity is enforced.
      await fillHub(hubSouth2.id);
      const rejected = await assignDeliveryHub(db, {
        zoneId: zone.id,
        warehouseId: warehouseB.id,
      });
      assert.equal(rejected.deliveryHubId, null);
      assert.equal(rejected.atCapacity, true);
    });

    await test("zone-pinned warehouses win routing when they can fulfil the order", async () => {
      const routed = await db.$transaction((tx) =>
        routeOrderToWarehouse(
          tx,
          [{ productId: product.id, quantity: 1 }],
          null,
          null,
          warehouseB.id,
        ),
      );
      assert.equal(routed.warehouseId, warehouseB.id);
      assert.equal(routed.legacyGlobalStock, false);

      const defaulted = await db.$transaction((tx) =>
        routeOrderToWarehouse(tx, [{ productId: product.id, quantity: 1 }], null, null),
      );
      assert.equal(defaulted.warehouseId, warehouseA.id);
    });

    await test("sales orders record the zone-pinned hub and are rejected at capacity", async () => {
      const zone = await db.deliveryZone.create({
        data: {
          name: "POS zone",
          warehouseId: warehouseB.id,
          deliveryHubId: hubPos.id,
        },
      });

      const result = await createSalesOrder({
        customerName: "Walk In",
        customerPhone: "01711110001",
        lines: [{ productId: product.id, quantity: 1 }],
        payment: "CASH",
        actor,
        zoneId: zone.id,
      });
      assert.ok(result.ok, JSON.stringify(result));
      if (!result.ok) return;

      const order = await db.order.findUniqueOrThrow({
        where: { number: result.orderNumber },
      });
      assert.equal(order.deliveryHubId, hubPos.id);
      assert.equal(order.warehouseId, warehouseB.id);

      // The successful sale already filled the desk for today and the zone's
      // warehouse alternatives (south desks) were filled by the previous test,
      // so the next sale hits capacity validation.
      const rejected = await createSalesOrder({
        customerName: "Walk In",
        customerPhone: "01711110002",
        lines: [{ productId: product.id, quantity: 1 }],
        payment: "CASH",
        actor,
        zoneId: zone.id,
      });
      assert.equal(rejected.ok, false);
      if (!rejected.ok) assert.match(rejected.error, /capacity/i);
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
