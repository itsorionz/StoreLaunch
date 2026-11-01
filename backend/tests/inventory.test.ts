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
  const name = `test_inventory_${randomUUID().replaceAll("-", "")}`;
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
    const { adjustInventory } = await import("../lib/inventory");
    const { createReservedOrder } = await import("../lib/order-placement");
    const admin = await db.user.create({
      data: {
        name: "Inventory admin",
        email: "admin@inventory.invalid",
        passwordHash: "unused",
        roles: [Roles.Admin],
      },
    });
    const customer = await db.user.create({
      data: {
        name: "Customer",
        email: "customer@inventory.invalid",
        passwordHash: "unused",
        roles: [Roles.Customer],
      },
    });
    const category = await db.category.create({ data: { name: "Stock", slug: "stock" } });
    const product = await db.product.create({
      data: {
        name: "Inventory item",
        slug: "inventory-item",
        categoryId: category.id,
        priceCents: 1000,
        stock: 10,
      },
    });
    async function input(delta = 2) {
      const fresh = await db.product.findUniqueOrThrow({ where: { id: product.id } });
      return {
        productId: product.id,
        requestKey: randomUUID(),
        expectedStock: fresh.stock,
        expectedUpdatedAt: fresh.updatedAt.toISOString(),
        delta,
        reason: "Stock count correction",
      };
    }
    await test("adjustment validates fields and requires a live active administrator", async () => {
      assert.equal(
        (await adjustInventory(admin.id, { ...(await input()), delta: 0, reason: "x" })).ok,
        false,
      );
      assert.equal((await adjustInventory(customer.id, await input())).ok, false);
      await db.user.update({ where: { id: admin.id }, data: { active: false } });
      assert.equal((await adjustInventory(admin.id, await input())).ok, false);
      await db.user.update({ where: { id: admin.id }, data: { active: true } });
      assert.equal(await db.inventoryAdjustment.count(), 0);
    });
    await test("stock and its administrator, reason and before/after evidence commit together", async () => {
      const value = await input(3);
      assert.equal((await adjustInventory(admin.id, value)).ok, true);
      const audit = await db.inventoryAdjustment.findUniqueOrThrow({
        where: { requestKey: value.requestKey },
      });
      assert.equal(audit.actorId, admin.id);
      assert.equal(audit.reason, value.reason);
      assert.equal(audit.previousStock, 10);
      assert.equal(audit.newStock, 13);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 13);
    });
    await test("concurrent retries of the same request apply the delta exactly once", async () => {
      const value = await input(-2);
      const results = await Promise.all([
        adjustInventory(admin.id, value),
        adjustInventory(admin.id, value),
      ]);
      assert.ok(results.every((result) => result.ok));
      assert.equal(results.filter((result) => result.replayed).length, 1);
      assert.equal(
        await db.inventoryAdjustment.count({ where: { requestKey: value.requestKey } }),
        1,
      );
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 11);
      assert.equal((await adjustInventory(admin.id, { ...value, delta: 4 })).ok, false);
      assert.equal(
        (await adjustInventory(admin.id, { ...value, expectedUpdatedAt: new Date().toISOString() }))
          .ok,
        false,
      );
    });
    await test("a checkout stock decrement makes an open adjustment stale without undoing the sale", async () => {
      const value = await input(10);
      const current = await db.product.findUniqueOrThrow({ where: { id: product.id } });
      const cart = await db.cart.create({
        data: { userId: customer.id, items: { create: { productId: product.id, quantity: 1 } } },
        include: { items: true },
      });
      const order = await createReservedOrder({
        userId: customer.id,
        number: randomUUID(),
        cart: {
          id: cart.id,
          items: [{ id: cart.items[0].id, quantity: 1, selected: true, product: current }],
          subtotalCents: current.priceCents,
          itemCount: 1,
        },
        shippingCents: 0,
        walletCents: 0,
        currencyCode: "BDT",
        currencySymbol: "BDT ",
        paymentMethod: PaymentMethods.COD,
        recipientName: "Customer",
        phone: "01700000000",
        line1: "123 Test Road",
        city: "Dhaka",
      });
      assert.equal(order.subtotalCents, current.priceCents);
      assert.equal(await db.cartItem.count({ where: { cartId: cart.id } }), 0);
      assert.equal((await adjustInventory(admin.id, value)).ok, false);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 10);
      assert.equal(
        await db.inventoryAdjustment.count({ where: { requestKey: value.requestKey } }),
        0,
      );
    });
    await test("an unchanged stock count still rejects an obsolete product version", async () => {
      const value = await input();
      await db.product.update({
        where: { id: product.id },
        data: { updatedAt: new Date(new Date(value.expectedUpdatedAt).getTime() + 1000) },
      });
      assert.equal((await adjustInventory(admin.id, value)).ok, false);
    });
    await test("competing adjustment requests from the same version cannot both win", async () => {
      const value = await input(1);
      const results = await Promise.all([
        adjustInventory(admin.id, value),
        adjustInventory(admin.id, { ...value, requestKey: randomUUID(), delta: -1 }),
      ]);
      assert.equal(results.filter((result) => result.ok).length, 1);
    });
    await test("stock bounds reject negative or excessive stock without an audit row", async () => {
      const value = await input(-1000000);
      assert.equal((await adjustInventory(admin.id, value)).ok, false);
      assert.equal((await adjustInventory(admin.id, { ...value, delta: 1000000 })).ok, false);
      assert.equal(
        await db.inventoryAdjustment.count({ where: { requestKey: value.requestKey } }),
        0,
      );
    });
    await test("audit write failure rolls back the stock change", async () => {
      const value = await input();
      await db.$executeRawUnsafe(
        `CREATE FUNCTION reject_inventory_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER reject_inventory_test BEFORE INSERT ON "InventoryAdjustment" FOR EACH ROW EXECUTE FUNCTION reject_inventory_test()`,
      );
      await assert.rejects(adjustInventory(admin.id, value));
      assert.equal(
        (await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock,
        value.expectedStock,
      );
      await db.$executeRawUnsafe(`DROP TRIGGER reject_inventory_test ON "InventoryAdjustment"`);
    });
    await test("saved adjustment evidence cannot be edited or deleted", async () => {
      const audit = await db.inventoryAdjustment.findFirstOrThrow();
      await assert.rejects(
        db.inventoryAdjustment.update({
          where: { id: audit.id },
          data: { reason: "Changed history" },
        }),
      );
      await assert.rejects(db.inventoryAdjustment.delete({ where: { id: audit.id } }));
      assert.equal(
        (await db.inventoryAdjustment.findUniqueOrThrow({ where: { id: audit.id } })).reason,
        audit.reason,
      );
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
