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
  const name = `test_dispatch_manifests_${randomUUID().replaceAll("-", "")}`;
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
    const {
      dailyCourierManifestNumber,
      ensureDailyCourierManifest,
      attachOrderToDailyManifest,
      openDailyCourierManifests,
      handoverDispatchManifest,
    } = await import("../lib/dispatch-manifests");
    const { bdDayKey } = await import("../lib/admin-dashboard-periods");

    const alpha = await db.deliveryCompany.create({ data: { name: "Alpha Movers" } });
    const bravo = await db.deliveryCompany.create({ data: { name: "Bravo Express" } });
    await db.deliveryCompany.create({ data: { name: "Retired Courier", active: false } });

    const customer = await db.user.create({
      data: {
        name: "Manifest Buyer",
        email: "manifest-buyer@manifest.invalid",
        phone: "01712340003",
        passwordHash: "unused",
        roles: [Roles.Customer],
      },
    });

    let orderSeq = 0;
    async function makeOrder(status: "Packed" | "Processing" = "Packed") {
      orderSeq += 1;
      return db.order.create({
        data: {
          number: `SL-MAN-${String(orderSeq).padStart(4, "0")}`,
          status,
          subtotalCents: 1200,
          totalCents: 1200,
          currencyCode: "BDT",
          currencySymbol: "৳",
          recipientName: "Manifest Buyer",
          phone: "01712340003",
          line1: "Street 1",
          city: "Dhaka",
          userId: customer.id,
        },
      });
    }

    const now = new Date();

    await test("manifest numbers are readable, day-scoped and unique per courier", () => {
      const number = dailyCourierManifestNumber(alpha, now);
      const dayKey = bdDayKey(now);
      assert.equal(number, `MAN-ALPHAMOV-${alpha.id.slice(-5).toUpperCase()}-${dayKey}`);
      const other = dailyCourierManifestNumber(bravo, now);
      assert.notEqual(number, other);
      assert.match(
        other,
        new RegExp(`^MAN-BRAVOEXP-${bravo.id.slice(-5).toUpperCase()}-${dayKey}$`),
      );
    });

    await test("a courier's daily manifest is created once and then reused", async () => {
      const first = await ensureDailyCourierManifest(alpha, { now });
      assert.equal(first.created, true);
      assert.equal(first.manifest.status, "Open");
      assert.equal(first.manifest.kind, "Courier");
      assert.equal(first.manifest.deliveryCompanyId, alpha.id);

      const second = await ensureDailyCourierManifest(alpha, { now });
      assert.equal(second.created, false);
      assert.equal(second.manifest.id, first.manifest.id);
    });

    await test("openDailyCourierManifests covers every active courier exactly once", async () => {
      // Alpha's manifest already exists from the ensure step; Bravo is missing.
      const run = await openDailyCourierManifests(now);
      assert.equal(run.carriers, 2);
      assert.equal(run.created, 1);
      assert.equal(run.numbers.length, 2);

      const repeat = await openDailyCourierManifests(now);
      assert.equal(repeat.created, 0);

      const manifests = await db.dispatchManifest.findMany({ include: { deliveryCompany: true } });
      assert.deepEqual(manifests.map((m) => m.deliveryCompany?.name).sort(), [
        "Alpha Movers",
        "Bravo Express",
      ]);
    });

    await test("attaching rolls an order into today's manifest and deduplicates", async () => {
      const order = await makeOrder();
      const attached = await attachOrderToDailyManifest({
        orderId: order.id,
        deliveryCompanyId: alpha.id,
        now,
      });
      assert.equal(attached.attached, true);
      assert.match(attached.manifestNumber, /^MAN-ALPHAMOV-/);

      const again = await attachOrderToDailyManifest({
        orderId: order.id,
        deliveryCompanyId: alpha.id,
        now,
      });
      assert.equal(again.attached, false);
      assert.match(again.reason ?? "", /already on a manifest/);

      // One order lives on exactly one manifest — another courier refuses it.
      const elsewhere = await attachOrderToDailyManifest({
        orderId: order.id,
        deliveryCompanyId: bravo.id,
        now,
      });
      assert.equal(elsewhere.attached, false);
      assert.match(elsewhere.reason ?? "", /already on a manifest/);

      const lines = await db.dispatchManifestLine.count({ where: { orderId: order.id } });
      assert.equal(lines, 1);
    });

    await test("handover closes the manifest, ships orders and preserves tracking", async () => {
      const plain = await makeOrder(); // no shipment yet → manual MAN-… tracking
      const tracked = await makeOrder(); // carrier tracking must survive
      await attachOrderToDailyManifest({ orderId: plain.id, deliveryCompanyId: alpha.id, now });
      await attachOrderToDailyManifest({ orderId: tracked.id, deliveryCompanyId: alpha.id, now });
      await db.shipment.create({
        data: {
          orderId: tracked.id,
          deliveryCompanyId: alpha.id,
          trackingNumber: "EXT-TRACK-9",
          status: "Pending",
          providerMode: "Manual",
        },
      });

      const manifest = await db.dispatchManifest.findFirstOrThrow({
        where: { number: { startsWith: "MAN-ALPHAMOV-" } },
      });
      // Derive expectations: every line without a shipment gets a manual one.
      const lineOrderIds = (
        await db.dispatchManifestLine.findMany({
          where: { manifestId: manifest.id },
          select: { orderId: true },
        })
      ).map((line) => line.orderId);
      const shipmentsBefore = await db.shipment.count({
        where: { orderId: { in: lineOrderIds } },
      });

      const result = await handoverDispatchManifest(manifest.id, now);
      assert.ok(result.ok);
      if (!result.ok) return;
      assert.equal(result.lines, lineOrderIds.length);
      assert.equal(result.shipmentsCreated, lineOrderIds.length - shipmentsBefore);

      const closed = await db.dispatchManifest.findUniqueOrThrow({ where: { id: manifest.id } });
      assert.equal(closed.status, "HandedOver");
      assert.ok(closed.handedOverAt);

      const plainShipment = await db.shipment.findUniqueOrThrow({ where: { orderId: plain.id } });
      assert.match(plainShipment.trackingNumber ?? "", /^MAN-MAN-/);
      assert.equal(plainShipment.status, "Shipped");
      assert.equal(plainShipment.deliveryCompanyId, alpha.id);

      const trackedShipment = await db.shipment.findUniqueOrThrow({
        where: { orderId: tracked.id },
      });
      assert.equal(trackedShipment.trackingNumber, "EXT-TRACK-9");

      for (const order of [plain, tracked]) {
        const shipped = await db.order.findUniqueOrThrow({ where: { id: order.id } });
        assert.equal(shipped.status, "Shipped");
        assert.ok(shipped.shippedAt);
        const event = await db.orderEvent.findFirstOrThrow({
          where: { orderId: order.id, message: { contains: manifest.number } },
        });
        assert.match(event.message, /Handed over with dispatch manifest/);
      }

      // Handing over twice is refused.
      const repeat = await handoverDispatchManifest(manifest.id, now);
      assert.equal(repeat.ok, false);
    });

    await test("a handed-over manifest refuses new attachments", async () => {
      const late = await makeOrder();
      const result = await attachOrderToDailyManifest({
        orderId: late.id,
        deliveryCompanyId: alpha.id,
        now,
      });
      assert.equal(result.attached, false);
      assert.match(result.reason ?? "", /already handed over/);
      assert.equal(await db.dispatchManifestLine.count({ where: { orderId: late.id } }), 0);
    });

    await test("orders still attach to other couriers' open manifests", async () => {
      const order = await makeOrder();
      const result = await attachOrderToDailyManifest({
        orderId: order.id,
        deliveryCompanyId: bravo.id,
        now,
      });
      assert.equal(result.attached, true);
      assert.match(result.manifestNumber, /^MAN-BRAVOEXP-/);
      assert.notEqual(
        result.manifestNumber,
        `MAN-ALPHAMOV-${alpha.id.slice(-5).toUpperCase()}-${bdDayKey(now)}`,
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
