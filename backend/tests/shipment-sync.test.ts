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
  const name = `test_shipment_sync_${randomUUID().replaceAll("-", "")}`;
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
    const { registerCourierAdapter } = await import("../lib/courier-adapter-registry");
    const { CourierApiError } = await import("../lib/courier-adapter");
    const { runShipmentSyncBatch, syncShipmentRecord, isSyncableShipment, SHIPMENT_SYNC_STALE_MS } =
      await import("../lib/shipment-sync");

    // Controllable carrier: tests flip the reported status or force a failure.
    const carrier = {
      reportedStatus: "InTransit" as string,
      failNext: false,
    };
    registerCourierAdapter("syncco", {
      name: "Sync Carrier",
      isApi: true,
      async createShipment(request: { parcel: unknown; trackingNumber?: string }) {
        return {
          trackingNumber: request.trackingNumber ?? null,
          status: "Created" as const,
          labelUrl: null,
        };
      },
      async getTracking(trackingNumber: string) {
        if (carrier.failNext) {
          carrier.failNext = false;
          throw new CourierApiError("syncco", "E_TIMEOUT", "carrier timeout");
        }
        const status = carrier.reportedStatus as
          | "Pending"
          | "Created"
          | "InTransit"
          | "OutForDelivery"
          | "Delivered"
          | "Failed"
          | "Returned";
        return {
          trackingNumber,
          status,
          statusHistory: [{ timestamp: new Date("2026-10-29T08:00:00Z"), status, location: "Hub" }],
        };
      },
      async calculateRate() {
        return { carrier: "Sync Carrier", rateCents: 400, currencyCode: "BDT" };
      },
      async generateLabel() {
        return { labelUrl: null, format: "URL" as const };
      },
      mapStatus() {
        return "Pending" as const;
      },
    });

    const company = await db.deliveryCompany.create({
      data: { name: "Sync Carrier", providerKey: "syncco" },
    });
    const customer = await db.user.create({
      data: {
        name: "Sync Buyer",
        email: "sync-buyer@sync.invalid",
        phone: "01712340002",
        passwordHash: "unused",
        roles: [Roles.Customer],
      },
    });

    async function makeShipment(
      suffix: string,
      data: {
        providerMode?: "Manual" | "Api";
        status?: string;
        lastSyncedAt?: Date;
        trackingNumber?: string | null;
      } = {},
    ) {
      const order = await db.order.create({
        data: {
          number: `SL-SYNC-${suffix}-${randomUUID().slice(0, 6).toUpperCase()}`,
          subtotalCents: 900,
          totalCents: 900,
          currencyCode: "BDT",
          currencySymbol: "৳",
          recipientName: "Sync Buyer",
          phone: "01712340002",
          line1: "Street 1",
          city: "Dhaka",
          userId: customer.id,
        },
      });
      const shipment = await db.shipment.create({
        data: {
          orderId: order.id,
          deliveryCompanyId: company.id,
          trackingNumber: data.trackingNumber === undefined ? `TRK-${suffix}` : data.trackingNumber,
          status: (data.status ?? "Pending") as "Pending",
          providerMode: data.providerMode ?? "Api",
          lastSyncedAt: data.lastSyncedAt ?? null,
        },
      });
      return { order, shipment };
    }

    // Stale enough for the batch to pick it up (or never synced).
    const stale = new Date(Date.now() - SHIPMENT_SYNC_STALE_MS - 60_000);
    const staleRow = await makeShipment("STALE", { lastSyncedAt: stale });
    // Future-dated lease: this row must stay skipped at every clock the suite
    // uses below (it only advances by ~half an hour).
    const freshRow = await makeShipment("FRESH", {
      lastSyncedAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
    });
    const terminalRow = await makeShipment("TERM", {
      status: "Delivered",
      lastSyncedAt: stale,
    });
    const manualRow = await makeShipment("MANUAL", {
      providerMode: "Manual",
      lastSyncedAt: stale,
    });

    await test("batch polls only stale, non-terminal API shipments", async () => {
      const outcomes = await runShipmentSyncBatch();
      assert.deepEqual(
        outcomes.map((o) => o.shipmentId),
        [staleRow.shipment.id],
      );
      assert.equal(outcomes[0].ok, true);
      assert.equal(outcomes[0].changed, true);
      assert.equal(outcomes[0].status, "InTransit");

      const synced = await db.shipment.findUniqueOrThrow({
        where: { id: staleRow.shipment.id },
      });
      assert.equal(synced.status, "InTransit");
      assert.ok(synced.lastSyncedAt);
      assert.ok(synced.lastSyncedAt.getTime() > stale.getTime());
      assert.ok(Array.isArray(synced.statusHistory));
      assert.equal((synced.statusHistory as unknown[]).length, 1);

      const event = await db.orderEvent.findFirstOrThrow({
        where: { orderId: staleRow.order.id },
      });
      assert.match(event.message, /Tracking updated from Sync Carrier: InTransit/);
    });

    await test("the polling lease skips shipments synced less than 15 minutes ago", async () => {
      assert.deepEqual(await runShipmentSyncBatch(), []);

      // Past the lease: re-polled, but an unchanged status is not an event.
      const later = new Date(Date.now() + SHIPMENT_SYNC_STALE_MS + 60_000);
      const outcomes = await runShipmentSyncBatch({ now: later });
      assert.deepEqual(
        outcomes.map((o) => o.shipmentId),
        [staleRow.shipment.id],
      );
      assert.equal(outcomes[0].ok, true);
      assert.equal(outcomes[0].changed, false);
      assert.equal(await db.orderEvent.count({ where: { orderId: staleRow.order.id } }), 1);
    });

    await test("carrier failures leave the lease untouched so the next run retries", async () => {
      carrier.failNext = true;
      const before = await db.shipment.findUniqueOrThrow({ where: { id: staleRow.shipment.id } });
      const retryAt = new Date(before.lastSyncedAt!.getTime() + SHIPMENT_SYNC_STALE_MS + 60_000);

      const outcomes = await runShipmentSyncBatch({ now: retryAt });
      assert.equal(outcomes.length, 1);
      assert.equal(outcomes[0].ok, false);
      assert.match(outcomes[0].error ?? "", /sync failed \(E_TIMEOUT\)/);

      const after = await db.shipment.findUniqueOrThrow({ where: { id: staleRow.shipment.id } });
      // Status and lease are exactly as before → eligible again immediately.
      assert.equal(after.status, before.status);
      assert.equal(after.lastSyncedAt?.getTime(), before.lastSyncedAt?.getTime());
      const retry = await runShipmentSyncBatch({ now: retryAt });
      assert.equal(retry.length, 1);
      assert.equal(retry[0].ok, true);
    });

    await test("manual sync reuses the same persistence path", async () => {
      carrier.reportedStatus = "OutForDelivery";
      const outcome = await syncShipmentRecord({
        id: staleRow.shipment.id,
        orderId: staleRow.order.id,
        trackingNumber: "TRK-STALE",
        status: "InTransit",
        deliveryCompany: {
          name: "Sync Carrier",
          providerKey: "syncco",
          apiBaseUrl: null,
          apiClientId: null,
          apiSecret: null,
          storeId: null,
        },
      });
      assert.equal(outcome.ok, true);
      assert.equal(outcome.changed, true);
      const synced = await db.shipment.findUniqueOrThrow({
        where: { id: staleRow.shipment.id },
      });
      assert.equal(synced.status, "OutForDelivery");
      assert.equal(await db.orderEvent.count({ where: { orderId: staleRow.order.id } }), 2);
    });

    await test("isSyncableShipment mirrors the batch filters for the UI", () => {
      assert.equal(isSyncableShipment(staleRow.shipment), true);
      assert.equal(isSyncableShipment(freshRow.shipment), true);
      assert.equal(isSyncableShipment(terminalRow.shipment), false);
      assert.equal(isSyncableShipment(manualRow.shipment), false);
      assert.equal(isSyncableShipment({ ...staleRow.shipment, trackingNumber: null }), false);
      assert.equal(isSyncableShipment({ ...staleRow.shipment, deliveryCompanyId: null }), false);
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
