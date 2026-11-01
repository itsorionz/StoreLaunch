import { OrderCurrencySources, OrderStatuses, PaymentMethods, Roles } from "@backend/lib/enums.mjs";
import { config } from "dotenv";
import { createPrismaClient } from "../lib/prisma-client";
import { PrismaClient, type Prisma } from "@backend/generated/prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { adminDashboardPeriods, dashboardChange } from "../lib/admin-dashboard-periods";

config({ quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Local PostgreSQL required",
  );
  const name = `test_admin_dashboard_${randomUUID().replaceAll("-", "")}`;
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
    const { getAdminDashboard } = await import("../lib/admin-dashboard");
    const now = new Date("2026-10-21T06:00:00Z");
    await test("dashboard dates use Bangladesh midnight and equal-duration comparisons", () => {
      const period = adminDashboardPeriods("7", now);
      assert.equal(period.start.toISOString(), "2026-10-14T18:00:00.000Z");
      assert.equal(period.dates[0].key, "2026-10-15");
      assert.equal(period.dates.at(-1)?.key, "2026-10-21");
      assert.equal(
        period.start.getTime() - period.previousStart.getTime(),
        now.getTime() - period.start.getTime(),
      );
      assert.equal(adminDashboardPeriods("invalid", now).days, 30);
      assert.equal(adminDashboardPeriods("90", now).dates.length, 90);
      assert.equal(dashboardChange(5, 0), "New activity");
      assert.equal(dashboardChange(0, 0), "No change");
      assert.equal(dashboardChange(15, 10), "+50% vs previous period");
    });
    await test("empty dashboard returns zero metrics and complete daily buckets", async () => {
      const data = await getAdminDashboard("BDT", "7", now);
      assert.equal(data.orders, 0);
      assert.equal(data.paidValue, 0);
      assert.equal(data.averagePaidValue, 0);
      assert.equal(data.days.length, 7);
      assert.ok(data.days.every((day) => day.orders === 0 && day.paidValue === 0));
      assert.equal(data.lowStockCount, 0);
      assert.equal(data.topProducts.length, 0);
    });
    const current = new Date("2026-10-20T23:00:00Z"),
      old = new Date("2026-09-01T00:00:00Z"),
      prior = new Date("2026-10-10T06:00:00Z");
    const buyer = await db.user.create({
      data: {
        email: "buyer@admin-dashboard.invalid",
        name: "Buyer",
        passwordHash: "unused",
        createdAt: current,
      },
    });
    await db.user.create({
      data: {
        email: "previous@admin-dashboard.invalid",
        name: "Previous",
        passwordHash: "unused",
        createdAt: prior,
      },
    });
    const operator = await db.user.create({
      data: {
        email: "operator@admin-dashboard.invalid",
        name: "Operator",
        passwordHash: "unused",
        roles: [Roles.Admin, Roles.Rider],
        createdAt: current,
      },
    });
    const rider = await db.rider.create({
      data: { name: "Rider", phone: "8801700000001", userId: operator.id },
    });
    const category = await db.category.create({ data: { name: "Dashboard", slug: "dashboard" } });
    const product = await db.product.create({
      data: {
        name: "Stock product",
        slug: "stock-product",
        priceCents: 500,
        stock: 3,
        categoryId: category.id,
      },
    });
    await db.product.create({
      data: {
        name: "Unavailable",
        slug: "unavailable",
        priceCents: 100,
        stock: 0,
        categoryId: category.id,
      },
    });
    await db.product.create({
      data: {
        name: "Inactive",
        slug: "inactive",
        priceCents: 100,
        stock: 0,
        active: false,
        categoryId: category.id,
      },
    });
    await db.review.create({ data: { userId: buyer.id, productId: product.id, rating: 5 } });
    const order = (data: Partial<Prisma.OrderUncheckedCreateInput> = {}) =>
      db.order.create({
        data: {
          number: randomUUID(),
          userId: buyer.id,
          recipientName: buyer.name,
          phone: "01700000000",
          line1: "Road",
          city: "Dhaka",
          subtotalCents: 1000,
          totalCents: 1000,
          currencyCode: "BDT",
          currencySymbol: "Tk",
          currencySource: OrderCurrencySources.Snapshot,
          paymentMethod: PaymentMethods.GATEWAY,
          createdAt: current,
          ...data,
        },
      });
    const firstPaid = await order({
      createdAt: old,
      status: OrderStatuses.Delivered,
      paymentMethod: PaymentMethods.COD,
      riderId: rider.id,
      paidAt: new Date("2026-10-14T18:00:00Z"),
      deliveredAt: current,
    });
    const pendingCod = await order({ paymentMethod: PaymentMethods.COD, walletPaidCents: 200 });
    const paid = await order({
      status: OrderStatuses.Paid,
      totalCents: 2000,
      paidAt: now,
      riderId: rider.id,
    });
    const cancelled = await order({
      status: OrderStatuses.Cancelled,
      totalCents: 9000,
      paidAt: current,
    });
    const foreign = await order({
      status: OrderStatuses.Delivered,
      totalCents: 7000,
      currencyCode: "USD",
      currencySymbol: "$",
      paymentMethod: PaymentMethods.COD,
      riderId: rider.id,
      paidAt: current,
      deliveredAt: current,
    });
    const unknown = await order({
      status: OrderStatuses.Paid,
      currencyCode: null,
      currencySymbol: null,
      currencySource: OrderCurrencySources.Unrecorded,
      paidAt: current,
    });
    const future = await order({
      status: OrderStatuses.Paid,
      totalCents: 100000,
      createdAt: new Date("2026-10-22T00:00:00Z"),
      paidAt: new Date("2026-10-22T00:00:00Z"),
    });
    await order({
      status: OrderStatuses.Shipped,
      paymentMethod: PaymentMethods.COD,
      createdAt: new Date("2026-10-16T00:00:00Z"),
      shippedAt: new Date(now.getTime() - 49 * 3600000),
      riderId: rider.id,
    });
    await order({
      status: OrderStatuses.Delivered,
      createdAt: old,
      paymentMethod: PaymentMethods.COD,
      currencyCode: null,
      currencySymbol: null,
      currencySource: OrderCurrencySources.Unrecorded,
    });
    await order({
      status: OrderStatuses.Delivered,
      paymentMethod: PaymentMethods.COD,
      totalCents: 100,
      walletPaidCents: 100,
      paidAt: current,
    });
    await order({ status: OrderStatuses.Paid, totalCents: 500, createdAt: prior, paidAt: prior });
    await order();
    for (const [itemOrder, quantity, priceCents] of [
      [paid, 3, 500],
      [pendingCod, 2, 100],
      [cancelled, 100, 500],
      [foreign, 100, 500],
      [unknown, 100, 500],
      [future, 100, 500],
      [firstPaid, 100, 500],
    ] as const) {
      await db.orderItem.create({
        data: {
          orderId: itemOrder.id,
          productId: product.id,
          name: product.name,
          slug: product.slug,
          priceCents,
          quantity,
        },
      });
    }
    for (const collected of [firstPaid, foreign])
      await db.codCollection.create({
        data: {
          orderId: collected.id,
          amountCents: collected.totalCents,
          currencyCode: collected.currencyCode!,
          collectedById: operator.id,
          collectedByRole: Roles.Rider,
          collectedByName: "Operator",
          courierName: rider.name,
          collectedAt: current,
        },
      });
    await test("metrics use event dates and exclude cancelled, future and other-currency payments", async () => {
      const data = await getAdminDashboard("BDT", "7", now);
      assert.equal(data.orders, 8);
      assert.equal(data.previousOrders, 1);
      assert.equal(data.paidValue, 3100);
      assert.equal(data.previousPaidValue, 500);
      assert.equal(data.paidCount, 3);
      assert.equal(data.averagePaidValue, 1033);
      assert.equal(data.delivered, 2);
      assert.equal(data.customers, 1);
      assert.equal(data.previousCustomers, 1);
      assert.equal(
        data.days.reduce((sum, day) => sum + day.orders, 0),
        data.orders,
      );
      assert.equal(
        data.days.reduce((sum, day) => sum + day.paidValue, 0),
        data.paidValue,
      );
      assert.equal(data.days[0].paidValue, 1000);
      assert.equal(data.otherPaidCurrencies, 1);
      assert.equal(data.legacyCurrency, 2);
      assert.equal(data.topProducts[0].units, 5);
      assert.equal(data.topProducts[0].value, 1700);
    });
    await test("work queues distinguish dispatch, online payment, overdue delivery and missing COD evidence", async () => {
      const data = await getAdminDashboard("BDT", "7", now);
      const queue = (key: string) => data.queues.find((value) => value.key === key)?.count;
      assert.equal(queue("dispatch"), 5);
      assert.equal(queue("unassigned"), 4);
      assert.equal(queue("payment"), 1);
      assert.equal(queue("overdue"), 1);
      assert.equal(queue("cod-review"), 1);
      assert.equal(data.lowStockCount, 2);
      assert.equal(data.outOfStock, 1);
      assert.equal(data.reviewCount, 1);
      assert.equal(data.riderCount, 1);
    });
    await test("cash uses wallet-adjusted open COD and keeps unremitted currencies separate", async () => {
      const data = await getAdminDashboard("BDT", "7", now);
      assert.equal(data.expectedCod, 1800);
      assert.equal(
        data.unremitted.find((value) => value.currencyCode === "BDT")?._sum.amountCents,
        1000,
      );
      assert.equal(
        data.unremitted.find((value) => value.currencyCode === "USD")?._sum.amountCents,
        7000,
      );
      await db.codCollection.update({
        where: { orderId: firstPaid.id },
        data: {
          remittedAt: now,
          remittedById: operator.id,
          remittedByName: "Operator",
          remittanceReference: "TEST-RECEIPT",
        },
      });
      const refreshed = await getAdminDashboard("BDT", "7", now);
      assert.equal(refreshed.unremitted.length, 1);
      assert.equal(refreshed.unremitted[0].currencyCode, "USD");
      assert.equal(refreshed.paidValue, data.paidValue);
    });
    await test("preparation stays in cash/active work but becomes dispatch-ready only when packed", async () => {
      const preparing = await order({
        status: OrderStatuses.Confirmed,
        paymentMethod: PaymentMethods.COD,
        walletPaidCents: 200,
        riderId: rider.id,
      });
      const before = await getAdminDashboard("BDT", "7", now);
      assert.equal(before.queues.find((value) => value.key === "preparing")?.count, 1);
      assert.equal(before.expectedCod, 2600);
      const readyBefore = before.queues.find((value) => value.key === "dispatch")!.count;
      await db.order.update({
        where: { id: preparing.id },
        data: { status: OrderStatuses.Packed },
      });
      const after = await getAdminDashboard("BDT", "7", now);
      assert.equal(after.queues.find((value) => value.key === "preparing")?.count, 0);
      assert.equal(after.queues.find((value) => value.key === "dispatch")?.count, readyBefore + 1);
      assert.equal(after.expectedCod, before.expectedCod);
    });
  } finally {
    await store?.$disconnect();
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);
    await admin.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
