import { config } from "dotenv";
import { createPrismaClient } from "../lib/prisma-client";
import { PrismaClient } from "@backend/generated/prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Roles, PaymentMethods, OrderStatuses, WalletTransactionTypes } from "../lib/enums.mjs";
import type { CartData } from "../lib/cart";

config({ quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  const name = `test_commerce_guards_${randomUUID().replaceAll("-", "")}`;
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
    const { saveStoreConfiguration } = await import("../lib/store-configuration");
    const { createReservedOrder } = await import("../lib/order-placement");
    const { transitionOrder } = await import("../lib/order-lifecycle");
    const { creditWalletBalance } = await import("../lib/wallet-balance");
    const { MoneyLimits } = await import("../lib/money-limits");
    const admin = await db.user.create({
      data: {
        name: "Guard admin",
        email: "guard@admin.invalid",
        passwordHash: "unused",
        roles: [Roles.Admin],
      },
    });
    const settings = await db.storeSettings.create({ data: { storeName: "Guard store" } });
    const configuration = async () => ({
      ...(await db.storeSettings.findUniqueOrThrow({ where: { id: settings.id } })),
      logoUrl: "",
      contactEmail: "",
      contactPhone: "",
      address: "",
      headerAnnouncement: "",
      headerSupportLabel: "",
      deliveryFeeCents: 0,
      freeShippingOverCents: "",
    });
    const category = await db.category.create({ data: { name: "Guard category", slug: "guard" } });
    async function fixture(priceCents = 1000, quantity = 2) {
      const key = randomUUID();
      const user = await db.user.create({
        data: { name: "Buyer", email: `${key}@guard.invalid`, passwordHash: "unused" },
      });
      const product = await db.product.create({
        data: { name: "Guard product", slug: key, categoryId: category.id, priceCents, stock: 10 },
      });
      const cart = await db.cart.create({
        data: { userId: user.id, items: { create: { productId: product.id, quantity } } },
        include: { items: true },
      });
      const snapshot: CartData = {
        id: cart.id,
        items: [{ id: cart.items[0].id, quantity, selected: true, product }],
        subtotalCents: priceCents * quantity,
        itemCount: quantity,
      };
      const currencyCode = (
        await db.storeSettings.findUniqueOrThrow({ where: { id: settings.id } })
      ).currencyCode;
      return {
        user,
        product,
        cart,
        input: {
          userId: user.id,
          number: key,
          cart: snapshot,
          shippingCents: 100,
          walletCents: 0,
          currencyCode,
          currencySymbol: "Test ",
          paymentMethod: PaymentMethods.COD,
          recipientName: user.name,
          phone: "01700000000",
          line1: "Guard road",
          city: "Dhaka",
        },
      };
    }
    await test("currency may change before catalog or monetary activity, with active admin authorization", async () => {
      assert.equal((await saveStoreConfiguration("missing", await configuration())).ok, false);
      assert.equal(
        (
          await saveStoreConfiguration(admin.id, {
            ...(await configuration()),
            currencyCode: "usd",
            currencySymbol: "$",
          })
        ).ok,
        true,
      );
      const current = await db.storeSettings.findUniqueOrThrow({ where: { id: settings.id } });
      assert.equal(current.currencyCode, "USD");
      assert.equal(current.currencyLockedAt, null);
    });
    await test("first product and concurrent configuration serialize, then currency stays locked after product removal", async () => {
      const results = await Promise.all([
        saveStoreConfiguration(admin.id, { ...(await configuration()), currencyCode: "BDT" }),
        db.product.create({
          data: { name: "First product", slug: "first", categoryId: category.id, priceCents: 100 },
        }),
      ]);
      assert.ok(results[1].id);
      const current = await db.storeSettings.findUniqueOrThrow({ where: { id: settings.id } });
      assert.ok(current.currencyLockedAt);
      assert.equal(current.currencyCode, results[0].ok ? "BDT" : "USD");
      await db.product.delete({ where: { id: results[1].id } });
      const rejected = await saveStoreConfiguration(admin.id, {
        ...(await configuration()),
        currencyCode: "EUR",
        storeName: "Must not save",
      });
      assert.equal(rejected.ok, false);
      assert.ok(rejected.fieldErrors?.currencyCode);
      assert.equal(
        (await db.storeSettings.findUniqueOrThrow({ where: { id: settings.id } })).storeName,
        "Guard store",
      );
      assert.equal(
        (
          await saveStoreConfiguration(admin.id, {
            ...(await configuration()),
            storeName: "Safe branding edit",
          })
        ).ok,
        true,
      );
      await assert.rejects(
        db.storeSettings.update({ where: { id: settings.id }, data: { currencyCode: "EUR" } }),
      );
      await assert.rejects(
        db.storeSettings.update({ where: { id: settings.id }, data: { currencyLockedAt: null } }),
      );
      await assert.rejects(db.storeSettings.delete({ where: { id: settings.id } }));
    });
    await test("store logo upload validates the file and persists the processed logo URL", async () => {
      const base = await configuration();
      const oversize = await saveStoreConfiguration(admin.id, {
        ...base,
        logoFile: new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", {
          type: "image/png",
        }),
      });
      assert.equal(oversize.ok, false);
      assert.ok(oversize.fieldErrors?.logoFile);
      const wrongType = await saveStoreConfiguration(admin.id, {
        ...base,
        logoFile: new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }),
      });
      assert.equal(wrongType.ok, false);
      assert.ok(wrongType.fieldErrors?.logoFile);
      // Rejected uploads never touch the stored logo.
      assert.equal(
        (await db.storeSettings.findUniqueOrThrow({ where: { id: settings.id } })).logoUrl,
        null,
      );
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      );
      const uploadedUrls: string[] = [];
      const rememberUrl = async () => {
        const current = (await db.storeSettings.findUniqueOrThrow({ where: { id: settings.id } }))
          .logoUrl;
        if (current?.startsWith("/uploads/logo/")) uploadedUrls.push(current);
        return current;
      };
      try {
        const uploaded = await saveStoreConfiguration(admin.id, {
          ...base,
          logoFile: new File([png], "logo.png", { type: "image/png" }),
        });
        assert.equal(uploaded.ok, true, JSON.stringify(uploaded));
        assert.match((await rememberUrl()) ?? "", /^\/uploads\/logo\/[0-9a-f-]+\.webp$/);
        // The uploaded logo wins over any URL typed into the form.
        await saveStoreConfiguration(admin.id, {
          ...base,
          logoUrl: "/typed-url.png",
          logoFile: new File([png], "logo.png", { type: "image/png" }),
        });
        const withBoth = await rememberUrl();
        assert.match(withBoth ?? "", /^\/uploads\/logo\/[0-9a-f-]+\.webp$/);
        assert.notEqual(withBoth, "/typed-url.png");
      } finally {
        await Promise.all(
          uploadedUrls.map((url) => rm(join(process.cwd(), "public", url), { force: true })),
        );
      }
    });
    await test("checkout rejects a stale currency without consuming cart or stock", async () => {
      const f = await fixture();
      await assert.rejects(
        createReservedOrder({ ...f.input, currencyCode: "EUR" }),
        /CURRENCY_CHANGED/,
      );
      assert.equal(await db.cartItem.count({ where: { cartId: f.cart.id } }), 1);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 10);
    });
    await test("large line totals and invalid shipping reject before any financial writes", async () => {
      const f = await fixture(1_000_000_000, 3);
      await assert.rejects(createReservedOrder(f.input), /ORDER_AMOUNT_LIMIT/);
      const small = await fixture();
      for (const shippingCents of [-1, 0.5, Number.NaN, MoneyLimits.maxStoredCents + 1])
        await assert.rejects(
          createReservedOrder({ ...small.input, shippingCents }),
          /INVALID_ORDER_AMOUNT/,
        );
      await assert.rejects(
        createReservedOrder({ ...small.input, shippingCents: MoneyLimits.maxStoredCents }),
        /ORDER_AMOUNT_LIMIT/,
      );
      assert.equal(await db.order.count(), 0);
      assert.equal(await db.cartItem.count({ where: { cartId: f.cart.id } }), 1);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 10);
    });
    await test("a valid near-limit order stores exact totals", async () => {
      const f = await fixture(1_000_000_000, 2);
      const order = await createReservedOrder(f.input);
      assert.equal(order.totalCents, 2_000_000_100);
      assert.equal(order.subtotalCents, 2_000_000_000);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 8);
    });
    await test("concurrent wallet credits cannot overflow and rejected credit rolls back its ledger", async () => {
      const f = await fixture();
      await db.wallet.create({
        data: { userId: f.user.id, balanceCents: MoneyLimits.maxStoredCents - 150 },
      });
      const credit = () =>
        db.$transaction(async (tx) => {
          const wallet = await creditWalletBalance(tx, f.user.id, 100);
          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              amountCents: 100,
              balanceAfterCents: wallet.balanceCents,
              type: WalletTransactionTypes.GIFT,
            },
          });
        });
      const results = await Promise.allSettled([credit(), credit()]);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { userId: f.user.id } })).balanceCents,
        MoneyLimits.maxStoredCents - 50,
      );
      assert.equal(
        await db.walletTransaction.count({ where: { wallet: { userId: f.user.id } } }),
        1,
      );
    });
    await test("refund overflow rolls back cancellation, stock and ledger with a clear result", async () => {
      const f = await fixture();
      await db.wallet.create({ data: { userId: f.user.id, balanceCents: 100 } });
      const order = await createReservedOrder({ ...f.input, walletCents: 50 });
      await db.wallet.update({
        where: { userId: f.user.id },
        data: { balanceCents: MoneyLimits.maxStoredCents - 25 },
      });
      const result = await transitionOrder(order.id, OrderStatuses.Cancelled);
      assert.equal(result.ok, false);
      assert.equal(
        (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
        OrderStatuses.Pending,
      );
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 8);
      assert.equal(
        await db.walletTransaction.count({
          where: { orderId: order.id, type: WalletTransactionTypes.REFUND },
        }),
        0,
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
