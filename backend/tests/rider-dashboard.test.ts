import { OrderCurrencySources, OrderStatuses, PaymentMethods, Roles } from "@backend/lib/enums.mjs";
import { config } from "dotenv";
import { createPrismaClient } from "../lib/prisma-client";
import { PrismaClient, type OrderStatus } from "@backend/generated/prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { riderPeriods } from "../lib/rider-periods";

config({ quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Local PostgreSQL required",
  );
  const name = `test_dashboard_${randomUUID().replaceAll("-", "")}`;
  const admin = createPrismaClient();
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  let db: PrismaClient | undefined;
  try {
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      env: process.env,
      stdio: "pipe",
    });
    db = (await import("../lib/db")).db;
    const store = db;
    const { getRiderDashboard } = await import("../lib/rider-dashboard");
    const now = new Date("2026-10-21T05:00:00Z");
    const user = await db.user.create({
      data: {
        name: "Dashboard Rider",
        email: "rider@dashboard.invalid",
        passwordHash: "unused",
        roles: [Roles.Rider],
      },
    });
    const other = await db.user.create({
      data: {
        name: "Other Rider",
        email: "other@dashboard.invalid",
        passwordHash: "unused",
        roles: [Roles.Rider],
      },
    });
    const rider = await db.rider.create({
      data: { name: user.name, phone: "8801700000001", userId: user.id },
    });
    const otherRider = await db.rider.create({
      data: { name: other.name, phone: "8801700000002", userId: other.id },
    });
    async function order(
      deliveredAt: string | null,
      status: OrderStatus = OrderStatuses.Delivered,
      owner = rider.id,
      currencyCode: string | null = "BDT",
      paymentMethod: typeof PaymentMethods.COD | typeof PaymentMethods.GATEWAY = PaymentMethods.COD,
    ) {
      return store.order.create({
        data: {
          number: randomUUID(),
          riderId: owner,
          userId: user.id,
          status,
          deliveredAt: deliveredAt ? new Date(deliveredAt) : null,
          paymentMethod,
          currencyCode,
          currencySymbol: currencyCode,
          currencySource: currencyCode
            ? OrderCurrencySources.Snapshot
            : OrderCurrencySources.Unrecorded,
          subtotalCents: 1000,
          totalCents: 1000,
          walletPaidCents: 200,
          recipientName: "Customer",
          phone: "01700000000",
          line1: "Dhaka Road",
          city: "Dhaka",
        },
      });
    }
    const a = await order("2026-10-20T18:00:00Z");
    const b = await order("2026-10-21T04:00:00Z");
    const yesterday = await order("2026-10-20T17:59:59Z");
    const monthStart = await order("2026-09-30T18:00:00Z");
    const previousMonth = await order("2026-09-30T17:59:59Z");
    const legacy = await order(null);
    const future = await order("2026-10-21T06:00:00Z");
    const cancelled = await order("2026-10-21T04:00:00Z", OrderStatuses.Cancelled);
    const foreign = await order("2026-10-21T04:00:00Z", OrderStatuses.Delivered, otherRider.id);
    const active = await order(null, OrderStatuses.Shipped);
    await order(null, OrderStatuses.Paid, rider.id, "USD");
    await order(null, OrderStatuses.Pending, rider.id, null);
    await order(null, OrderStatuses.Pending, rider.id, "BDT", PaymentMethods.GATEWAY);
    async function cash(
      orderId: string,
      amountCents: number,
      currencyCode: string,
      collectedAt: string,
      remittedAt: string | null = null,
      actor = user.id,
      role: string = Roles.Rider,
    ) {
      return store.codCollection.create({
        data: {
          orderId,
          amountCents,
          currencyCode,
          collectedAt: new Date(collectedAt),
          remittedAt: remittedAt ? new Date(remittedAt) : null,
          collectedById: actor,
          collectedByName: "Collector",
          collectedByRole: role,
          courierName: "Courier",
          ...(remittedAt
            ? { remittedById: "admin", remittedByName: "Admin", remittanceReference: "Receipt" }
            : {}),
        },
      });
    }
    await cash(a.id, 800, "BDT", "2026-10-20T18:00:00Z");
    await cash(b.id, 500, "USD", "2026-10-21T00:00:00Z", "2026-10-21T04:00:00Z");
    await cash(yesterday.id, 100, "BDT", "2026-10-20T17:59:59Z", "2026-10-21T00:00:00Z");
    await cash(monthStart.id, 200, "BDT", "2026-09-30T18:00:00Z");
    await cash(previousMonth.id, 400, "BDT", "2026-09-30T17:59:59Z", "2026-10-02T00:00:00Z");
    await cash(legacy.id, 300, "BDT", "2026-05-10T00:00:00Z");
    await cash(future.id, 999, "BDT", "2026-10-21T06:00:00Z");
    await cash(cancelled.id, 999, "BDT", "2026-10-21T00:00:00Z", null, user.id, Roles.Admin);
    await cash(foreign.id, 999, "BDT", "2026-10-21T00:00:00Z", null, other.id);
    await db.deliveryAttempt.create({
      data: {
        riderId: rider.id,
        orderId: active.id,
        reason: "NO_ANSWER",
        note: "Retry arranged",
        createdAt: new Date("2026-10-20T20:00:00Z"),
        nextAttemptAt: new Date("2026-10-21T04:00:00Z"),
      },
    });

    await test("Bangladesh day/week/month boundaries handle UTC rollover and year changes", () => {
      const p = riderPeriods(new Date("2026-12-31T18:10:00Z"));
      assert.equal(p.dayStart.toISOString(), "2026-12-31T18:00:00.000Z");
      assert.equal(p.monthStart.toISOString(), "2026-12-31T18:00:00.000Z");
      assert.equal(p.months.at(-1)?.key, "2027-01");
      assert.equal(p.days.at(-1)?.key, "2027-01-01");
      assert.equal(riderPeriods(now).weekStart.toISOString(), "2026-10-18T18:00:00.000Z");
    });
    await test("daily and monthly delivery counts use completed dates and exclude other riders, cancelled and future records", async () => {
      const data = await getRiderDashboard(rider.id, user.id, now);
      assert.deepEqual(data.delivered, { today: 2, week: 3, month: 4, total: 6, undated: 1 });
      assert.equal(data.daily.at(-1)?.count, 2);
      assert.equal(data.daily.at(-2)?.count, 1);
      assert.equal(data.monthly.at(-1)?.count, 4);
      assert.equal(data.monthly.at(-2)?.count, 1);
      assert.equal(data.monthly.length, 6);
      assert.equal(data.daily.length, 7);
    });
    await test("cash reports use actual collection and receipt dates and separate currencies", async () => {
      const data = await getRiderDashboard(rider.id, user.id, now);
      const bdt = data.cash.find((row) => row.currencyCode === "BDT")!;
      const usd = data.cash.find((row) => row.currencyCode === "USD")!;
      assert.equal(bdt.today, 800);
      assert.equal(bdt.month, 1100);
      assert.equal(bdt.held, 2299);
      assert.equal(bdt.invalidDates, 1);
      assert.equal(bdt.handoverMonth, 500);
      assert.equal(bdt.handoverToday, 100);
      assert.equal(usd.today, 500);
      assert.equal(usd.held, 0);
      assert.equal(usd.handoverMonth, 500);
      assert.equal(
        data.monthly.at(-1)?.cash.find((row) => row.currencyCode === "BDT")?.amount,
        1100,
      );
    });
    await test("operational queues distinguish pickup, payment, retry and unknown-currency cash", async () => {
      const data = await getRiderDashboard(rider.id, user.id, now);
      assert.equal(data.outForDelivery, 1);
      assert.equal(data.awaitingPickup, 2);
      assert.equal(data.awaitingPayment, 1);
      assert.equal(data.retriesDue, 1);
      assert.equal(data.todayAttempts, 1);
      assert.equal(data.cancelled, 1);
      assert.equal(data.unknownCashOrders, 1);
      assert.deepEqual(data.remaining, [
        { currencyCode: "BDT", amount: 800 },
        { currencyCode: "USD", amount: 800 },
      ]);
    });
    await test("empty rider dashboards contain zero-filled charts and no other rider's cash", async () => {
      const data = await getRiderDashboard("no-rider", "no-user", now);
      assert.equal(data.delivered.total, 0);
      assert.equal(data.cash.length, 0);
      assert.ok(data.monthly.every((row) => row.count === 0 && row.cash.length === 0));
    });
    await test("database-generated timestamps use UTC even when the database session uses local time", async () => {
      const id = randomUUID();
      const before = Date.now();
      const rows = await store.$queryRaw<
        { createdAt: Date }[]
      >`INSERT INTO "Category" (id, name, slug, "updatedAt") VALUES (${id}, 'UTC default check', ${id}, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')) RETURNING "createdAt"`;
      assert.ok(rows[0].createdAt.getTime() >= before - 1000);
      assert.ok(rows[0].createdAt.getTime() <= Date.now() + 1000);
    });
  } finally {
    await db?.$disconnect();
    await admin.$executeRawUnsafe(`DROP DATABASE "${name}"`);
    await admin.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
