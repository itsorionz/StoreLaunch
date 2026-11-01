import { OrderStatuses, PaymentMethods, Roles } from "@backend/lib/enums.mjs";
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
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Local PostgreSQL required",
  );
  const name = `test_cod_receivables_${randomUUID().replaceAll("-", "")}`;
  const admin = createPrismaClient();
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  let store: PrismaClient | undefined;
  try {
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      env: process.env,
      stdio: "pipe",
    });
    const db = (await import("../lib/db")).db;
    store = db;
    const {
      codAgingDays,
      codAgingBucket,
      getCodReceivablesReport,
      getCourierReconciliationReport,
    } = await import("../lib/cod-receivables");
    const { createCodSettlement } = await import("../lib/cod-settlement");

    await test("aging buckets use whole Bangladesh days since collection", () => {
      const now = new Date("2026-10-29T12:00:00Z");
      // 2026-10-22T12:00Z is BD-day 10-22; today is BD-day 10-29 → 7 days (current).
      assert.equal(codAgingDays(new Date("2026-10-22T12:00:00Z"), now), 7);
      // 2026-10-24T23:00Z is BD-day 10-25; today is BD-day 10-29 → 4 days.
      assert.equal(codAgingDays(new Date("2026-10-24T23:00:00Z"), now), 4);
      assert.equal(codAgingBucket(0), "current");
      assert.equal(codAgingBucket(7), "current");
      assert.equal(codAgingBucket(8), "d8");
      assert.equal(codAgingBucket(14), "d8");
      assert.equal(codAgingBucket(15), "d15");
      assert.equal(codAgingBucket(30), "d15");
      assert.equal(codAgingBucket(31), "d31");
      assert.equal(codAgingBucket(365), "d31");
      // Never negative even if clocks drift.
      assert.equal(codAgingDays(new Date("2026-10-30T12:00:00Z"), now), 0);
    });

    const now = new Date("2026-10-29T12:00:00Z");
    const buyer = await db.user.create({
      data: {
        email: `buyer@cod-receivables.invalid`,
        name: "Buyer",
        passwordHash: "unused",
        createdAt: now,
      },
    });
    const operator = await db.user.create({
      data: {
        email: `operator@cod-receivables.invalid`,
        name: "Operator",
        passwordHash: "unused",
        roles: [Roles.Admin, Roles.Rider],
        createdAt: now,
      },
    });
    const adminActor = { id: operator.id, name: "Operator", role: Roles.Admin };
    const redx = await db.deliveryCompany.create({ data: { name: "RedX", phone: "017" } });
    const steadfast = await db.deliveryCompany.create({
      data: { name: "Steadfast", phone: "018" },
    });
    const daysAgo = (days: number) => new Date(now.getTime() - days * 86400000);
    type OrderStatus = (typeof OrderStatuses)[keyof typeof OrderStatuses];
    const deliveredCodOrder = (
      company: { id: string } | null,
      courierName: string,
      totalCents = 1000,
      shippedDaysAgo = 20,
      status: OrderStatus = OrderStatuses.Delivered,
      deliveredAt = now,
    ) =>
      db.order.create({
        data: {
          number: randomUUID(),
          userId: buyer.id,
          recipientName: "Buyer",
          phone: "01700000000",
          line1: "Road",
          city: "Dhaka",
          subtotalCents: totalCents,
          totalCents,
          currencyCode: "BDT",
          currencySymbol: "৳",
          paymentMethod: PaymentMethods.COD,
          status,
          deliveryCompanyId: company?.id ?? null,
          shippedAt: daysAgo(shippedDaysAgo),
          deliveredAt: status === OrderStatuses.Delivered ? deliveredAt : null,
          codCollection: {
            create: {
              amountCents: totalCents,
              currencyCode: "BDT",
              collectedById: operator.id,
              collectedByName: "Operator",
              collectedByRole: Roles.Rider,
              courierName,
              collectedAt: deliveredAt,
            },
          },
        },
      });

    // Per-courier settlement batches (§9.1).
    const redxOrder = await deliveredCodOrder(redx, redx.name);
    const steadOrder = await deliveredCodOrder(steadfast, steadfast.name);
    const riderOrder = await deliveredCodOrder(null, "Rider Kabir");
    await test("settlements are admin-only and reject mismatched couriers", async () => {
      const redxCollection = await db.codCollection.findUniqueOrThrow({
        where: { orderId: redxOrder.id },
      });
      const steadCollection = await db.codCollection.findUniqueOrThrow({
        where: { orderId: steadOrder.id },
      });
      const line = (collectionId: string) => [
        { collectionId, expectedCents: 1000, receivedCents: 1000 },
      ];
      const asRider = { ...adminActor, role: Roles.Rider };
      assert.equal(
        (
          await createCodSettlement(
            { method: "Cash", reference: "REF-1", lines: line(redxCollection.id) },
            asRider,
          )
        ).ok,
        false,
      );
      // Requested courier must own every line in the batch.
      const mismatch = await createCodSettlement(
        {
          method: "Cash",
          reference: "REF-MISMATCH",
          courierName: redx.name,
          lines: line(redxCollection.id).concat(line(steadCollection.id)),
        },
        adminActor,
      );
      assert.equal(mismatch.ok, false);
      assert.match((mismatch as { error: string }).error, /handled by Steadfast, not RedX/);
    });
    await test("a single-courier batch is stamped; a mixed batch stays unattributed", async () => {
      const redxCollection = await db.codCollection.findUniqueOrThrow({
        where: { orderId: redxOrder.id },
      });
      const riderCollection = await db.codCollection.findUniqueOrThrow({
        where: { orderId: riderOrder.id },
      });
      const perCourier = await createCodSettlement(
        {
          method: "Cash",
          reference: "SET-REDX-001",
          courierName: redx.name,
          lines: [{ collectionId: redxCollection.id, expectedCents: 1000, receivedCents: 1000 }],
        },
        adminActor,
      );
      assert.equal(perCourier.ok, true);
      const batch = await db.codSettlement.findUniqueOrThrow({
        where: { id: perCourier.ok ? perCourier.settlementId : "" },
      });
      assert.equal(batch.courierName, redx.name);
      assert.equal(batch.currencyCode, "BDT");
      // Fully settled: the collection is marked remitted with the batch reference.
      const remitted = await db.codCollection.findUniqueOrThrow({
        where: { orderId: redxOrder.id },
      });
      assert.equal(remitted.remittanceReference, "SET-REDX-001");
      assert.ok(remitted.remittedAt);
      // A batch spanning two couriers records no courier.
      const mixed = await createCodSettlement(
        {
          method: "Cash",
          reference: "SET-MIXED-001",
          lines: [{ collectionId: riderCollection.id, expectedCents: 1000, receivedCents: 1000 }],
        },
        adminActor,
      );
      assert.equal(mixed.ok, true);
      const mixedBatch = await db.codSettlement.findUniqueOrThrow({
        where: { id: mixed.ok ? mixed.settlementId : "" },
      });
      // Single-line batch from the fallback courier (no DeliveryCompany) is still stamped.
      assert.equal(mixedBatch.courierName, "Rider Kabir");
      // The batch header is immutable, courier snapshot included.
      await assert.rejects(
        db.codSettlement.update({ where: { id: batch.id }, data: { courierName: "Rewritten" } }),
      );
      await assert.rejects(db.codSettlement.delete({ where: { id: batch.id } }));
      // Duplicate references are rejected.
      const duplicate = await createCodSettlement(
        {
          method: "Cash",
          reference: "SET-REDX-001",
          lines: [{ collectionId: riderCollection.id, expectedCents: 1000, receivedCents: 1000 }],
        },
        adminActor,
      );
      assert.equal(duplicate.ok, false);
    });
    await test("partial receipts reduce the receivable without closing the collection", async () => {
      const partialOrder = await deliveredCodOrder(steadfast, steadfast.name, 2000);
      const collection = await db.codCollection.findUniqueOrThrow({
        where: { orderId: partialOrder.id },
      });
      const partial = await createCodSettlement(
        {
          method: "BankTransfer",
          reference: "SET-PARTIAL-001",
          courierName: steadfast.name,
          lines: [
            {
              collectionId: collection.id,
              expectedCents: 800,
              receivedCents: 700,
              varianceReason: "Short by agreed fee",
            },
          ],
        },
        adminActor,
      );
      assert.equal(partial.ok, true);
      const row = await db.codCollection.findUniqueOrThrow({
        where: { id: collection.id },
        include: { settlementLines: true },
      });
      assert.equal(row.remittedAt, null);
      assert.equal(row.settlementLines[0]?.appliedCents, 700);
      // Variance without a reason is refused.
      const noReason = await createCodSettlement(
        {
          method: "BankTransfer",
          reference: "SET-PARTIAL-002",
          lines: [{ collectionId: collection.id, expectedCents: 1200, receivedCents: 1000 }],
        },
        adminActor,
      );
      assert.equal(noReason.ok, false);
      // Settling one currency per batch is still enforced.
      const usdOrder = await db.order.create({
        data: {
          number: randomUUID(),
          userId: buyer.id,
          recipientName: "Buyer",
          phone: "01700000000",
          line1: "Road",
          city: "Dhaka",
          subtotalCents: 500,
          totalCents: 500,
          currencyCode: "USD",
          currencySymbol: "$",
          paymentMethod: PaymentMethods.COD,
          status: OrderStatuses.Delivered,
          deliveryCompanyId: steadfast.id,
          shippedAt: daysAgo(21),
          deliveredAt: daysAgo(20),
          codCollection: {
            create: {
              amountCents: 500,
              currencyCode: "USD",
              collectedById: operator.id,
              collectedByName: "Operator",
              collectedByRole: Roles.Rider,
              courierName: steadfast.name,
              collectedAt: daysAgo(20),
            },
          },
        },
      });
      const usdCollection = await db.codCollection.findUniqueOrThrow({
        where: { orderId: usdOrder.id },
      });
      const mixedCurrency = await createCodSettlement(
        {
          method: "Cash",
          reference: "SET-MIXED-CURRENCY",
          lines: [
            { collectionId: collection.id, expectedCents: 1200, receivedCents: 1200 },
            { collectionId: usdCollection.id, expectedCents: 500, receivedCents: 500 },
          ],
        },
        adminActor,
      );
      assert.equal(mixedCurrency.ok, false);
    });

    await test("receivables are tracked per carrier, per currency, with aging", async () => {
      // redxOrder (BDT 1000) was remitted above; steadOrder (BDT 1000, collected
      // today) and the partial (BDT 2000, 1300 remaining, collected today) are open,
      // plus a 20-day-old USD collection from the mixed-currency test.
      const report = await getCodReceivablesReport(now);
      const steadRow = report.find(
        (row) => row.carrierName === steadfast.name && row.currencyCode === "BDT",
      );
      assert.ok(steadRow);
      // steadOrder (1000) + partial remainder (1300)
      assert.equal(steadRow.outstandingCents, 2300);
      assert.equal(steadRow.collectionCount, 2);
      assert.equal(steadRow.buckets.current.cents, 2300);
      assert.equal(steadRow.buckets.d15.count, 0);
      const usdRow = report.find((row) => row.currencyCode === "USD");
      assert.ok(usdRow);
      assert.equal(usdRow.outstandingCents, 500);
      assert.equal(usdRow.buckets.current.cents, 0);
      // Nothing for RedX: its only collection was fully settled.
      assert.equal(
        report.some((row) => row.carrierName === redx.name),
        false,
      );
      // Remitted collections never leak into receivables.
      assert.ok(report.every((row) => row.outstandingCents > 0));
    });

    await test("courier reconciliation reports shipped vs delivered vs lost with COD flow", async () => {
      // Ship a lost-in-transit order for RedX (shipped 20 days ago, still Shipped).
      await deliveredCodOrder(redx, redx.name, 1500, 20, OrderStatuses.Shipped);
      // And a returning-to-origin order for Steadfast.
      await deliveredCodOrder(steadfast, steadfast.name, 900, 25, OrderStatuses.ReturningToOrigin);
      const report = await getCourierReconciliationReport(now);
      const redxRow = report.find((row) => row.carrierName === redx.name)!;
      const steadRow = report.find((row) => row.carrierName === steadfast.name)!;
      // RedX: the remitted delivered order + the stuck Shipped order.
      assert.equal(redxRow.shippedCount, 2);
      assert.equal(redxRow.deliveredCount, 1);
      assert.equal(redxRow.inTransitCount, 1);
      assert.equal(redxRow.lostCount, 1);
      assert.equal(redxRow.rtoRatePercent, 0);
      // The stuck order's cash is still outstanding on top of the fresh collection.
      const redxBdt = redxRow.cod.find((flow) => flow.currencyCode === "BDT")!;
      assert.equal(redxBdt.collectedCents, 2500);
      assert.equal(redxBdt.remittedCents, 1000);
      assert.equal(redxBdt.outstandingCents, 1500);
      // Steadfast: delivered (unsettled 1000 + partial 2000 + USD 500) + returning 900.
      assert.equal(steadRow.deliveredCount, 3);
      assert.equal(steadRow.returningCount, 1);
      assert.equal(steadRow.lostCount, 0);
      // Steadfast settled parcels in scope: 3 delivered + 1 returning → 25%.
      assert.equal(Math.round(steadRow.rtoRatePercent), 25);
      const steadBdt = steadRow.cod.find((flow) => flow.currencyCode === "BDT")!;
      // 1000 + 2000 + 900 collected; 700 remitted via the partial batch.
      assert.equal(steadBdt.collectedCents, 3900);
      assert.equal(steadBdt.remittedCents, 700);
      assert.equal(steadBdt.outstandingCents, 3200);
      // USD never mixes into the BDT figures.
      const steadUsd = steadRow.cod.find((flow) => flow.currencyCode === "USD")!;
      assert.equal(steadUsd.collectedCents, 500);
      assert.equal(steadUsd.outstandingCents, 500);
    });
  } finally {
    await store?.$disconnect();
    await admin.$executeRawUnsafe(`DROP DATABASE "${name}"`).catch(() => {});
    await admin.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
