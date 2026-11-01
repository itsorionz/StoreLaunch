/** Local, disposable database integration tests; no external provider calls. */
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
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Cart merge tests require local PostgreSQL");
  const databaseName = `test_cart_merge_${randomUUID().replaceAll("-", "")}`;
  const admin = createPrismaClient();
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  url.pathname = `/${databaseName}`;
  url.searchParams.set("schema", "public");
  process.env.DATABASE_URL = url.toString();
  let testDb: PrismaClient | undefined;
  try {
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      env: process.env,
      stdio: "pipe",
      timeout: 60_000,
    });
    const { db } = await import("../lib/db");
    testDb = db;
    const { mergeGuestCartIntoUserCart } = await import("../lib/cart-merge");
    async function fixture(stock = 20) {
      const key = randomUUID();
      const user = await db.user.create({
        data: { name: "Cart buyer", email: `${key}@example.test`, passwordHash: "unused" },
      });
      const category = await db.category.create({ data: { name: key, slug: key } });
      const product = await db.product.create({
        data: { name: key, slug: key, categoryId: category.id, priceCents: 1000, stock },
      });
      return { user, product };
    }
    await test("guest lines merge with existing basket while preserving both selection states", async () => {
      const { user, product } = await fixture();
      const second = await db.product.create({
        data: {
          name: "Other",
          slug: randomUUID(),
          categoryId: product.categoryId,
          priceCents: 2000,
          stock: 10,
        },
      });
      const owned = await db.cart.create({
        data: {
          userId: user.id,
          items: { create: { productId: product.id, quantity: 3, selected: false } },
        },
      });
      const guest = await db.cart.create({
        data: {
          items: {
            create: [
              { productId: product.id, quantity: 2 },
              { productId: second.id, quantity: 4, selected: false },
            ],
          },
        },
      });
      assert.deepEqual(await mergeGuestCartIntoUserCart(guest.id, user.id), {
        mergedLines: 2,
        cappedLines: 0,
        unavailableLines: 0,
      });
      const lines = await db.cartItem.findMany({ where: { cartId: owned.id } });
      assert.equal(lines.find((line) => line.productId === product.id)?.quantity, 5);
      assert.equal(lines.find((line) => line.productId === product.id)?.selected, false);
      assert.equal(lines.find((line) => line.productId === second.id)?.quantity, 4);
      assert.equal(lines.find((line) => line.productId === second.id)?.selected, false);
      assert.equal(await db.cart.findUnique({ where: { id: guest.id } }), null);
    });
    await test("stock and 99-unit caps apply; inactive and unavailable guest lines are reported", async () => {
      const { user, product } = await fixture(5);
      const make = (stock: number, active = true) =>
        db.product.create({
          data: {
            name: "Cap",
            slug: randomUUID(),
            categoryId: product.categoryId,
            priceCents: 1000,
            stock,
            active,
          },
        });
      const [lots, inactive, empty] = await Promise.all([make(200), make(10, false), make(0)]);
      const guest = await db.cart.create({
        data: {
          items: {
            create: [product, lots, inactive, empty].map((p) => ({
              productId: p.id,
              quantity: 110,
            })),
          },
        },
      });
      assert.deepEqual(await mergeGuestCartIntoUserCart(guest.id, user.id), {
        mergedLines: 2,
        cappedLines: 2,
        unavailableLines: 2,
      });
      const cart = await db.cart.findUniqueOrThrow({
        where: { userId: user.id },
        include: { items: true },
      });
      assert.equal(cart.items.find((line) => line.productId === product.id)?.quantity, 5);
      assert.equal(cart.items.find((line) => line.productId === lots.id)?.quantity, 99);
      assert.equal(cart.items.length, 2);
    });
    await test("retries and concurrent merge requests consume the guest only once", async () => {
      const { user, product } = await fixture();
      const guest = await db.cart.create({
        data: { items: { create: { productId: product.id, quantity: 4 } } },
      });
      await Promise.all([
        mergeGuestCartIntoUserCart(guest.id, user.id),
        mergeGuestCartIntoUserCart(guest.id, user.id),
      ]);
      await mergeGuestCartIntoUserCart(guest.id, user.id);
      const cart = await db.cart.findUniqueOrThrow({
        where: { userId: user.id },
        include: { items: true },
      });
      assert.equal(cart.items[0].quantity, 4);
      assert.equal(await db.cart.count({ where: { userId: user.id } }), 1);
    });
    await test("different guest baskets merging concurrently preserve both additions", async () => {
      const { user, product } = await fixture();
      const guests = await Promise.all(
        [2, 3].map((quantity) =>
          db.cart.create({ data: { items: { create: { productId: product.id, quantity } } } }),
        ),
      );
      await Promise.all(guests.map((guest) => mergeGuestCartIntoUserCart(guest.id, user.id)));
      const cart = await db.cart.findUniqueOrThrow({
        where: { userId: user.id },
        include: { items: true },
      });
      assert.equal(cart.items[0].quantity, 5);
    });
    await test("a known authenticated cart ID cannot be consumed as a guest basket", async () => {
      const { user, product } = await fixture();
      const other = await fixture();
      const owned = await db.cart.create({
        data: { userId: other.user.id, items: { create: { productId: product.id, quantity: 3 } } },
      });
      assert.deepEqual(await mergeGuestCartIntoUserCart(owned.id, user.id), {
        mergedLines: 0,
        cappedLines: 0,
        unavailableLines: 0,
      });
      assert.equal(await db.cart.count({ where: { userId: user.id } }), 0);
      assert.equal(await db.cartItem.count({ where: { cartId: owned.id } }), 1);
    });
    await test("merge failure rolls back and leaves guest and existing basket intact", async () => {
      const { user, product } = await fixture();
      const owned = await db.cart.create({
        data: { userId: user.id, items: { create: { productId: product.id, quantity: 2 } } },
      });
      const guest = await db.cart.create({
        data: { items: { create: { productId: product.id, quantity: 3 } } },
      });
      await db.$executeRawUnsafe(
        `CREATE FUNCTION reject_guest_delete() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'simulated delete failure'; END; $$ LANGUAGE plpgsql`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER test_merge_rollback BEFORE DELETE ON "Cart" FOR EACH ROW EXECUTE FUNCTION reject_guest_delete()`,
      );
      try {
        await assert.rejects(mergeGuestCartIntoUserCart(guest.id, user.id));
      } finally {
        await db.$executeRawUnsafe(`DROP TRIGGER test_merge_rollback ON "Cart"`);
        await db.$executeRawUnsafe(`DROP FUNCTION reject_guest_delete()`);
      }
      assert.equal(
        (await db.cartItem.findFirstOrThrow({ where: { cartId: owned.id } })).quantity,
        2,
      );
      assert.equal(
        (await db.cartItem.findFirstOrThrow({ where: { cartId: guest.id } })).quantity,
        3,
      );
    });
    await test("an existing unavailable basket line is preserved, not silently removed or reduced", async () => {
      const { user, product } = await fixture(2);
      const owned = await db.cart.create({
        data: {
          userId: user.id,
          items: { create: { productId: product.id, quantity: 5, selected: false } },
        },
      });
      const guest = await db.cart.create({
        data: { items: { create: { productId: product.id, quantity: 2 } } },
      });
      assert.deepEqual(await mergeGuestCartIntoUserCart(guest.id, user.id), {
        mergedLines: 0,
        cappedLines: 1,
        unavailableLines: 0,
      });
      const line = await db.cartItem.findFirstOrThrow({ where: { cartId: owned.id } });
      assert.equal(line.quantity, 5);
      assert.equal(line.selected, false);
    });
  } finally {
    await testDb?.$disconnect();
    await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`);
    await admin.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Cart merge integration tests failed");
  process.exitCode = 1;
});
