import { config } from "dotenv";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createPrismaClient } from "../lib/prisma-client";
import type { PrismaClient } from "@backend/generated/prisma/client";
import { OrderStatuses, PaymentMethods, Roles, WalletTransactionTypes } from "../lib/enums.mjs";

config({ quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  const databaseName = "test_referrals_" + randomUUID().replaceAll("-", "");
  const admin = createPrismaClient();
  await admin.$executeRawUnsafe('CREATE DATABASE "' + databaseName + '"');
  url.pathname = "/" + databaseName;
  process.env.DATABASE_URL = url.toString();
  let store: PrismaClient | undefined;
  try {
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      env: process.env,
      stdio: "pipe",
      timeout: 60_000,
    });
    const { db } = await import("../lib/db");
    store = db;
    const { getReferralCode, createReferredCustomer, rewardDeliveredReferral } =
      await import("../lib/referrals");
    const { transitionOrder } = await import("../lib/order-lifecycle");
    const { settingsSchema } = await import("../lib/store-configuration");
    const settings = await db.storeSettings.create({ data: { storeName: "Referral test" } });
    const referrer = await db.user.create({
      data: {
        email: "sender@example.test",
        name: "Sender",
        passwordHash: "unused",
        roles: [Roles.Customer],
      },
    });
    const code = await getReferralCode(referrer.id);
    const signup = (referralCode = code) =>
      createReferredCustomer({
        email: randomUUID() + "@example.test",
        name: "Friend",
        passwordHash: "unused",
        referralCode,
      });
    const order = (userId: string, phone = "01712345678") =>
      db.order.create({
        data: {
          userId,
          number: randomUUID(),
          status: OrderStatuses.Shipped,
          subtotalCents: 10000,
          totalCents: 10000,
          currencyCode: "BDT",
          currencySymbol: "Tk",
          paymentMethod: PaymentMethods.GATEWAY,
          paidAt: new Date(),
          recipientName: "Friend",
          phone,
          line1: "Referral road",
          city: "Dhaka",
        },
      });

    await test("referral code is stable across concurrent requests", async () => {
      assert.deepEqual(
        await Promise.all([getReferralCode(referrer.id), getReferralCode(referrer.id)]),
        [code, code],
      );
    });
    await test("invalid codes fail atomically, normal signup remains available when paused", async () => {
      const count = await db.user.count();
      await assert.rejects(signup("NOTACODE"), /INVALID_REFERRAL/);
      assert.equal(await db.user.count(), count);
      await db.storeSettings.update({
        where: { id: settings.id },
        data: { referralEnabled: false },
      });
      await assert.rejects(signup(), /INVALID_REFERRAL/);
      assert.ok((await signup("")).id);
      await db.storeSettings.update({
        where: { id: settings.id },
        data: { referralEnabled: true },
      });
    });
    await test("signup snapshots reward and locks currency; competing deliveries pay exactly once even after a pause", async () => {
      const friend = await signup(code.toLowerCase());
      const referral = await db.referral.findUniqueOrThrow({ where: { refereeId: friend.id } });
      assert.equal(referral.rewardCents, 4000);
      assert.ok(
        (await db.storeSettings.findUniqueOrThrow({ where: { id: settings.id } })).currencyLockedAt,
      );
      await db.storeSettings.update({
        where: { id: settings.id },
        data: { referralRewardCents: 7500, referralEnabled: false },
      });
      const [first, second] = await Promise.all([order(friend.id), order(friend.id)]);
      const results = await Promise.all([
        transitionOrder(first.id, OrderStatuses.Delivered),
        transitionOrder(second.id, OrderStatuses.Delivered),
      ]);
      assert.ok(results.every((result) => result.ok));
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { userId: referrer.id } })).balanceCents,
        4000,
      );
      assert.equal(
        await db.walletTransaction.count({
          where: { type: WalletTransactionTypes.ReferralReward },
        }),
        1,
      );
      assert.equal(await db.inboxMessage.count({ where: { userId: referrer.id } }), 1);
      assert.equal(await db.$transaction((tx) => rewardDeliveredReferral(tx, first.id)), false);
      assert.ok(
        (await db.referral.findUniqueOrThrow({ where: { refereeId: friend.id } })).rewardedAt,
      );
      await db.storeSettings.update({
        where: { id: settings.id },
        data: { referralEnabled: true },
      });
    });
    await test("new signups use the updated amount; unpaid orders and shared-phone referrals earn nothing", async () => {
      const friend = await signup();
      assert.equal(
        (await db.referral.findUniqueOrThrow({ where: { refereeId: friend.id } })).rewardCents,
        7500,
      );
      const unpaid = await order(friend.id);
      await db.order.update({
        where: { id: unpaid.id },
        data: { status: OrderStatuses.Delivered, paidAt: null },
      });
      assert.equal(await db.$transaction((tx) => rewardDeliveredReferral(tx, unpaid.id)), false);
      await db.user.update({ where: { id: referrer.id }, data: { phone: "01712345678" } });
      const shared = await order(friend.id);
      assert.equal((await transitionOrder(shared.id, OrderStatuses.Delivered)).ok, true);
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { userId: referrer.id } })).balanceCents,
        4000,
      );
    });
    await test("admin reward amounts validate decimal precision and range", () => {
      const amount = settingsSchema.shape.referralRewardAmount;
      assert.equal(amount.parse("40"), 4000);
      assert.equal(amount.parse("40.50"), 4050);
      for (const invalid of ["-1", "40.123", "100001", "NaN", ""])
        assert.equal(amount.safeParse(invalid).success, false);
    });
  } finally {
    await store?.$disconnect();
    await admin.$executeRawUnsafe('DROP DATABASE "' + databaseName + '"');
    await admin.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
