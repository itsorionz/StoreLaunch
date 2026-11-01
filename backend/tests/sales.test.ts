import { config } from "dotenv";
import { createPrismaClient } from "../lib/prisma-client";
import { PrismaClient } from "@backend/generated/prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { OrderStatuses, OrderSources, Roles } from "../lib/enums.mjs";

config({ quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Local database required");
  const name = `test_sales_${randomUUID().replaceAll("-", "")}`;
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
    const { createSalesOrder } = await import("../lib/sales-orders");
    const { createReservedOrder } = await import("../lib/order-placement");
    const { transitionOrder } = await import("../lib/order-lifecycle");

    const salesRep = {
      id: "",
      role: Roles.Sales,
      name: "Counter Rep",
    };
    const category = await db.category.create({ data: { name: "POS", slug: "pos" } });
    const product = await db.product.create({
      data: {
        name: "POS item",
        slug: "pos-item",
        categoryId: category.id,
        priceCents: 5000,
        salePriceCents: 4000,
        stock: 8,
      },
    });
    const warehouse = await db.warehouse.create({
      data: { name: "Main", code: "MAIN", isDefault: true },
    });
    await db.stockLevel.create({
      data: { warehouseId: warehouse.id, productId: product.id, qty: 8, minStock: 2 },
    });
    const repUser = await db.user.create({
      data: {
        name: "Counter Rep",
        email: "sales@sales.invalid",
        phone: "01700000001",
        passwordHash: "unused",
        roles: [Roles.Sales],
      },
    });
    salesRep.id = repUser.id;

    async function parity(): Promise<boolean> {
      const [{ stock }] = await db.$queryRaw<{ stock: number }[]>`
        SELECT COALESCE(SUM(stock), 0)::int AS stock FROM "Product"
      `;
      const [{ qty }] = await db.$queryRaw<{ qty: number }[]>`
        SELECT COALESCE(SUM(qty), 0)::int AS qty FROM "StockLevel"
      `;
      return stock === qty;
    }

    await test("POS sale validates the phone number and requires at least one line", async () => {
      const base = {
        customerName: "Walk In",
        customerPhone: "12345",
        lines: [{ productId: product.id, quantity: 1 }],
        payment: "CASH" as const,
        actor: salesRep,
      };
      const badPhone = await createSalesOrder(base);
      assert.equal(badPhone.ok, false);
      const noLines = await createSalesOrder({ ...base, customerPhone: "01711112222", lines: [] });
      assert.equal(noLines.ok, false);
    });

    await test("counter cash sale decrements global and per-warehouse stock and records movements", async () => {
      const result = await createSalesOrder({
        customerName: "Walk In",
        customerPhone: "01711112222",
        lines: [{ productId: product.id, quantity: 2 }],
        payment: "CASH",
        actor: salesRep,
      });
      assert.ok(result.ok);
      if (!result.ok) return;
      assert.match(result.orderNumber, /^SL-\d{8}-\d{8}$/);

      const order = await db.order.findUniqueOrThrow({
        where: { number: result.orderNumber },
        include: { items: true },
      });
      assert.equal(order.source, OrderSources.SalesRep);
      // Sale price (campaign-less) applies, not the list price.
      assert.equal(order.subtotalCents, 4000 * 2);
      assert.equal(order.totalCents, 8000);
      assert.equal(order.status, OrderStatuses.Paid);
      assert.ok(order.paidAt);
      assert.equal(order.warehouseId, warehouse.id);
      assert.equal(order.items.length, 1);
      assert.equal(order.items[0].quantity, 2);
      assert.equal(order.items[0].priceCents, 4000);

      assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 6);
      const level = await db.stockLevel.findUniqueOrThrow({
        where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } },
      });
      assert.equal(level.qty, 6);
      assert.equal(await parity(), true);

      const movement = await db.stockMovement.findFirstOrThrow({
        where: { productId: product.id, reasonCode: "Sale", referenceId: result.orderNumber },
      });
      assert.equal(movement.delta, -2);
      assert.equal(movement.warehouseId, warehouse.id);
      assert.equal(movement.actorId, repUser.id);
    });

    await test("walk-in customers are created once and reused across sales", async () => {
      const phone = "01733334444";
      const first = await createSalesOrder({
        customerName: "Repeat Buyer",
        customerPhone: phone,
        lines: [{ productId: product.id, quantity: 1 }],
        payment: "COD",
        actor: salesRep,
      });
      assert.ok(first.ok);
      const second = await createSalesOrder({
        customerName: "Repeat Buyer",
        customerPhone: `+8801733334444`,
        lines: [{ productId: product.id, quantity: 1 }],
        payment: "COD",
        actor: salesRep,
      });
      assert.ok(second.ok);
      const customers = await db.user.count({ where: { phone } });
      assert.equal(customers, 1);
      // COD sales are confirmed but not paid.
      if (first.ok && second.ok) {
        const codOrder = await db.order.findUniqueOrThrow({
          where: { number: first.orderNumber },
        });
        assert.equal(codOrder.status, OrderStatuses.Confirmed);
        assert.equal(codOrder.paidAt, null);
      }
    });

    await test("insufficient warehouse stock rejects the sale without partial writes", async () => {
      const before = await db.order.count({ where: { source: OrderSources.SalesRep } });
      const result = await createSalesOrder({
        customerName: "Too Much",
        customerPhone: "01755556666",
        lines: [{ productId: product.id, quantity: 99 }],
        payment: "CASH",
        actor: salesRep,
      });
      assert.equal(result.ok, false);
      assert.equal(await db.order.count({ where: { source: OrderSources.SalesRep } }), before);
      assert.equal(await parity(), true);
    });

    await test("checkout routes to the matching warehouse and cancellation restores its stock", async () => {
      const dhaka = await db.warehouse.create({
        data: { name: "Dhaka", code: "DHK", city: "Dhaka" },
      });
      const chattogram = await db.warehouse.create({
        data: { name: "Chattogram", code: "CGP", city: "Chattogram" },
      });
      await db.stockLevel.createMany({
        data: [
          { warehouseId: dhaka.id, productId: product.id, qty: 5 },
          { warehouseId: chattogram.id, productId: product.id, qty: 3 },
        ],
      });
      // Mirror the new per-warehouse rows in the sellable total to stay in parity.
      await db.product.update({ where: { id: product.id }, data: { stock: { increment: 8 } } });
      const buyer = await db.user.create({
        data: {
          name: "Online Buyer",
          email: "buyer@sales.invalid",
          passwordHash: "unused",
          roles: [Roles.Customer],
        },
      });
      const cart = await db.cart.create({
        data: { userId: buyer.id, items: { create: { productId: product.id, quantity: 2 } } },
        include: { items: true },
      });
      const order = await createReservedOrder({
        userId: buyer.id,
        cart: {
          id: cart.id,
          items: cart.items.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            selected: true,
            product: {
              id: product.id,
              name: product.name,
              nameBn: null,
              slug: product.slug,
              priceCents: product.priceCents,
              salePriceCents: product.salePriceCents,
              stock: product.stock,
              images: [],
            },
          })),
          subtotalCents: product.priceCents * 2,
          itemCount: 2,
        },
        shippingCents: 0,
        walletCents: 0,
        paymentMethod: "COD",
        currencyCode: "BDT",
        currencySymbol: "৳",
        recipientName: "Online Buyer",
        phone: "01799990000",
        line1: "Street 1",
        city: "Chattogram",
      });
      // Address-matched warehouse wins over the default.
      assert.equal(order.warehouseId, chattogram.id);
      const chattogramLevel = await db.stockLevel.findUniqueOrThrow({
        where: {
          warehouseId_productId: { warehouseId: chattogram.id, productId: product.id },
        },
      });
      assert.equal(chattogramLevel.qty, 1);
      assert.equal(await parity(), true);

      const cancelled = await transitionOrder(order.id, OrderStatuses.Cancelled, {
        actor: { id: repUser.id, name: "Counter Rep", role: Roles.Admin },
      });
      assert.ok(cancelled.ok);
      const restored = await db.stockLevel.findUniqueOrThrow({
        where: {
          warehouseId_productId: { warehouseId: chattogram.id, productId: product.id },
        },
      });
      assert.equal(restored.qty, 3);
      assert.equal(await parity(), true);
    });

    await test("POS sales snapshot commission from the rep's current rate", async () => {
      const { commissionCentsFor, isValidCommissionBps } = await import("../lib/sales-commission");

      // Pure helpers first: bps are rounded, invalid totals pay nothing.
      assert.equal(commissionCentsFor(4000, 500), 200); // 5% of ৳40
      assert.equal(commissionCentsFor(1234, 333), 41);
      assert.equal(commissionCentsFor(0, 500), 0);
      assert.equal(commissionCentsFor(-100, 500), 0);
      assert.equal(commissionCentsFor(Number.NaN, 500), 0);
      assert.equal(commissionCentsFor(4000, -50), 0);
      assert.equal(isValidCommissionBps(0), true);
      assert.equal(isValidCommissionBps(5000), true);
      assert.equal(isValidCommissionBps(5001), false);
      assert.equal(isValidCommissionBps(12.5), false);

      await db.user.update({ where: { id: repUser.id }, data: { commissionBps: 500 } });
      const first = await createSalesOrder({
        customerName: "Commission Buyer",
        customerPhone: "01777778881",
        lines: [{ productId: product.id, quantity: 1 }],
        payment: "CASH",
        actor: salesRep,
      });
      assert.ok(first.ok);
      if (!first.ok) return;
      const firstOrder = await db.order.findUniqueOrThrow({
        where: { number: first.orderNumber },
      });
      assert.equal(firstOrder.salesRepId, repUser.id);
      assert.equal(firstOrder.commissionCents, 200);

      // Changing the rate must not rewrite what earlier sales already earned.
      await db.user.update({ where: { id: repUser.id }, data: { commissionBps: 1000 } });
      const second = await createSalesOrder({
        customerName: "Commission Buyer",
        customerPhone: "01777778881",
        lines: [{ productId: product.id, quantity: 1 }],
        payment: "CASH",
        actor: salesRep,
      });
      assert.ok(second.ok);
      if (!second.ok) return;
      const secondOrder = await db.order.findUniqueOrThrow({
        where: { number: second.orderNumber },
      });
      assert.equal(secondOrder.commissionCents, 400);

      const firstAgain = await db.order.findUniqueOrThrow({
        where: { number: first.orderNumber },
      });
      assert.equal(firstAgain.commissionCents, 200);
      await db.user.update({ where: { id: repUser.id }, data: { commissionBps: 0 } });
    });

    await test("commission report sums snapshots per rep", async () => {
      const { getCommissionReport, getRepCommission } = await import("../lib/sales-commission");

      const report = await getCommissionReport();
      const row = report.rows.find((r) => r.userId === repUser.id);
      assert.ok(row);
      assert.equal(row.commissionBps, 0);
      // Only the two commission-enabled sales paid out (৳200 + ৳400).
      assert.equal(row.commissionCents, 600);
      assert.equal(row.revenueCents > 0, true);
      assert.equal(report.totals.commissionCents, 600);
      assert.equal(report.totals.orders, row.orders);
      assert.equal(row.sharePercent, 100);
      assert.equal(
        report.idleReps.some((rep) => rep.userId === repUser.id),
        false,
      );

      const since = new Date("2000-01-01T00:00:00Z");
      const lifetime = await getRepCommission(repUser.id, since);
      assert.equal(lifetime.orders, row.orders);
      assert.equal(lifetime.commissionCents, 600);
      assert.equal(lifetime.revenueCents, row.revenueCents);

      // Future window: nothing attributed yet.
      const future = await getRepCommission(repUser.id, new Date("2100-01-01T00:00:00Z"));
      assert.deepEqual(future, { orders: 0, revenueCents: 0, commissionCents: 0 });
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
