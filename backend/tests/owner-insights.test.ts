import { config } from "dotenv";
import { createPrismaClient } from "../lib/prisma-client";
import { PrismaClient } from "@backend/generated/prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { Roles, PaymentMethods, OrderEventTypes } from "../lib/enums.mjs";

config({ quiet: true });

const MINUTE = 60000;
const DAY = 86400000;

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Local database required");
  const name = `test_owner_insights_${randomUUID().replaceAll("-", "")}`;
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
      getProfitSnapshot,
      getMoneyPosition,
      getLicenseStatus,
      getGrowthSignals,
      getCampaignPerformance,
      getActivityTrail,
    } = await import("../lib/owner-insights");

    // ----- fixtures ---------------------------------------------------------
    const now = new Date();
    const category = await db.category.create({
      data: { name: "Test Category", slug: "test-category" },
    });
    const prodA = await db.product.create({
      data: {
        name: "Profit Product",
        slug: "profit-product",
        priceCents: 1000,
        costCents: 600,
        stock: 100,
        sku: "PROFIT-A",
        categoryId: category.id,
      },
    });
    const prodB = await db.product.create({
      data: {
        name: "Campaign Product",
        slug: "campaign-product",
        priceCents: 1000,
        costCents: 400,
        stock: 100,
        sku: "CAMP-B",
        categoryId: category.id,
      },
    });

    const mkUser = (email: string) =>
      db.user.create({
        data: { name: email.split("@")[0], email, passwordHash: "unused", roles: [Roles.Customer] },
      });
    const profitUser = await mkUser("profit@owner.invalid");
    const codUser = await mkUser("cod@owner.invalid");
    const cartUserA = await mkUser("carta@owner.invalid");
    const cartUserB = await mkUser("cartb@owner.invalid");
    const cartUserE = await mkUser("carte@owner.invalid");
    const wishUser1 = await mkUser("wish1@owner.invalid");
    const wishUser2 = await mkUser("wish2@owner.invalid");
    const notifyUser1 = await mkUser("notify1@owner.invalid");
    const notifyUser2 = await mkUser("notify2@owner.invalid");
    const notifyUser3 = await mkUser("notify3@owner.invalid");
    const notifyUser4 = await mkUser("notify4@owner.invalid");
    const referrer = await mkUser("referrer@owner.invalid");
    const referee = await mkUser("referee@owner.invalid");

    let orderSeq = 0;
    const mkOrder = (
      number: string,
      userId: string,
      overrides: Record<string, unknown> = {},
      items: {
        productId: string;
        name: string;
        slug: string;
        priceCents: number;
        quantity: number;
      }[],
    ) =>
      db.order.create({
        data: {
          number,
          status: "Pending",
          subtotalCents: items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0),
          shippingCents: 60,
          totalCents: items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0) + 60,
          currencyCode: "BDT",
          currencySymbol: "৳",
          paymentMethod: PaymentMethods.COD,
          recipientName: "Customer",
          phone: "01700000000",
          line1: "Test Address",
          city: "Dhaka",
          userId,
          items: { create: items },
          ...overrides,
        },
      });
    const itemA = (quantity: number, priceCents = 1000) => [
      { productId: prodA.id, name: prodA.name, slug: prodA.slug, priceCents, quantity },
    ];
    const itemB = (quantity: number, priceCents = 800) => [
      { productId: prodB.id, name: prodB.name, slug: prodB.slug, priceCents, quantity },
    ];

    // Profit fixtures: only the in-period BDT delivered order counts.
    await mkOrder(
      `PO-${orderSeq++}`,
      profitUser.id,
      { status: "Delivered", deliveredAt: new Date(now.getTime() - DAY) },
      itemA(2),
    );
    await mkOrder(
      `PO-${orderSeq++}`,
      profitUser.id,
      { status: "Delivered", deliveredAt: new Date(now.getTime() - 40 * DAY) },
      itemA(5),
    );
    await mkOrder(`PO-${orderSeq++}`, profitUser.id, { status: "Cancelled" }, itemA(7));
    await mkOrder(
      `PO-${orderSeq++}`,
      profitUser.id,
      {
        status: "Delivered",
        deliveredAt: new Date(now.getTime() - DAY),
        currencyCode: "USD",
        currencySymbol: "$",
      },
      itemA(3),
    );

    // COD fixtures: one fully unremitted collection, one partly settled.
    const codOrder1 = await mkOrder(`CO-${orderSeq++}`, codUser.id, {}, itemA(1));
    const codOrder2 = await mkOrder(`CO-${orderSeq++}`, codUser.id, {}, itemA(1));
    await db.codCollection.create({
      data: {
        orderId: codOrder1.id,
        amountCents: 1000,
        currencyCode: "BDT",
        collectedById: codUser.id,
        collectedByName: "COD User",
        collectedByRole: "Admin",
        courierName: "Test Courier",
      },
    });
    const collection2 = await db.codCollection.create({
      data: {
        orderId: codOrder2.id,
        amountCents: 500,
        currencyCode: "BDT",
        collectedById: codUser.id,
        collectedByName: "COD User",
        collectedByRole: "Admin",
        courierName: "Other Courier",
      },
    });
    const settlement = await db.codSettlement.create({
      data: {
        currencyCode: "BDT",
        method: "Cash",
        reference: "SETTLE-1",
        courierName: "Other Courier",
        expectedCents: 500,
        receivedCents: 200,
        varianceCents: -300,
        varianceReason: "Cash shortage noted at handover",
        receivedById: codUser.id,
        receivedByName: "Alice Admin",
        receivedAt: new Date(now.getTime() - MINUTE / 2),
      },
    });
    await db.codSettlementLine.create({
      data: {
        settlementId: settlement.id,
        codCollectionId: collection2.id,
        outstandingCents: 500,
        expectedCents: 500,
        receivedCents: 200,
        appliedCents: 200,
        varianceCents: -300,
        varianceReason: "Cash shortage noted at handover",
      },
    });

    // Wallet + refund fixtures (a refund must reference an order).
    const refundOrder1 = await mkOrder(`RF-${orderSeq++}`, profitUser.id, {}, itemA(1));
    const refundOrder2 = await mkOrder(`RF-${orderSeq++}`, profitUser.id, {}, itemA(1));
    const refundOrder3 = await mkOrder(`RF-${orderSeq++}`, profitUser.id, {}, itemA(1));
    await db.wallet.create({ data: { userId: profitUser.id, balanceCents: 5000 } });
    await db.wallet.create({ data: { userId: cartUserA.id, balanceCents: 3000 } });
    await db.refundRecord.create({
      data: {
        orderId: refundOrder1.id,
        tender: "Wallet",
        status: "Completed",
        amountCents: 250,
        currencyCode: "BDT",
        completedById: profitUser.id,
        completedByName: "Alice Admin",
        createdAt: new Date(now.getTime() - DAY),
      },
    });
    await db.refundRecord.create({
      data: {
        orderId: refundOrder2.id,
        tender: "Gateway",
        status: "Completed",
        amountCents: 100,
        currencyCode: "BDT",
        completedById: profitUser.id,
        completedByName: "Alice Admin",
        createdAt: new Date(now.getTime() - 40 * DAY),
      },
    });
    await db.refundRecord.create({
      data: {
        orderId: refundOrder3.id,
        tender: "Cash",
        status: "AwaitingExternal",
        amountCents: 75,
        currencyCode: "BDT",
        completedById: profitUser.id,
        completedByName: "Alice Admin",
      },
    });
    // Foreign-currency refund: must stay out of the store-currency totals and
    // surface separately instead of being summed into a BDT figure.
    const refundOrder4 = await mkOrder(`RF-${orderSeq++}`, profitUser.id, {}, itemA(1));
    await db.refundRecord.create({
      data: {
        orderId: refundOrder4.id,
        tender: "Gateway",
        status: "Completed",
        amountCents: 500,
        currencyCode: "USD",
        completedById: profitUser.id,
        completedByName: "Alice Admin",
        createdAt: new Date(now.getTime() - DAY),
      },
    });

    // Cart fixtures: A = stale, B = fresh, C = guest stale, D = unselected only,
    // E = stale but the user ordered afterwards (converted).
    const mkCart = async (userId: string | null, ageMs: number, selected = true) => {
      const cart = await db.cart.create({ data: { userId } });
      await db.cartItem.create({
        data: { cartId: cart.id, productId: prodA.id, quantity: 2, selected },
      });
      await db.cart.update({
        where: { id: cart.id },
        data: { updatedAt: new Date(now.getTime() - ageMs) },
      });
      return cart;
    };
    await mkCart(cartUserA.id, 2 * 3600000);
    await mkCart(cartUserB.id, 1 * MINUTE);
    await mkCart(null, 2 * DAY);
    await mkCart(null, 2 * 3600000, false);
    const convertedCart = await mkCart(cartUserE.id, 2 * 3600000);
    await mkOrder(`CV-${orderSeq++}`, cartUserE.id, { status: "Paid", createdAt: now }, itemA(1));

    // Demand + referral fixtures.
    await db.wishlist.createMany({
      data: [
        { userId: wishUser1.id, productId: prodA.id },
        { userId: wishUser2.id, productId: prodA.id },
      ],
    });
    await db.stockNotification.createMany({
      data: [
        { userId: notifyUser1.id, productId: prodB.id },
        { userId: notifyUser2.id, productId: prodB.id },
        { userId: notifyUser3.id, productId: prodB.id },
        { userId: notifyUser4.id, productId: prodB.id, notifiedAt: now },
      ],
    });
    await db.storeSettings.create({ data: { referralRewardCents: 4000 } });
    // A rewarded referral must point at the order that qualified it
    // ("Referral_reward_consistency" check constraint).
    const referralOrder = await mkOrder(`RF-${orderSeq++}`, referee.id, {}, itemA(1));
    await db.referral.create({
      data: {
        referrerId: referrer.id,
        refereeId: referee.id,
        rewardCents: 4000,
        currencyCode: "BDT",
        rewardedAt: now,
        qualifyingOrderId: referralOrder.id,
      },
    });

    // Campaign fixtures: one active flash sale on prodB; sold 3 @ 800 via a
    // paid order plus 5 @ 800 in a cancelled order (must be excluded).
    const campaign = await db.campaign.create({
      data: {
        title: "Flash Week",
        imageUrl: "/banners/test.webp",
        linkUrl: "/campaigns/flash-week",
        active: true,
        flashSale: true,
        showOnHome: true,
        products: { create: { productId: prodB.id, offerPriceCents: 800 } },
      },
    });
    // Ended within the reporting window → must still be reported.
    const endedCampaign = await db.campaign.create({
      data: {
        title: "Ended Week",
        imageUrl: "/banners/ended.webp",
        linkUrl: "/campaigns/ended-week",
        active: false,
        showOnHome: true,
        products: { create: { productId: prodB.id, offerPriceCents: 900 } },
      },
    });
    // Ended longer ago than the window → drops out.
    const staleCampaign = await db.campaign.create({
      data: {
        title: "Ancient Week",
        imageUrl: "/banners/ancient.webp",
        linkUrl: "/campaigns/ancient-week",
        active: false,
        updatedAt: new Date(now.getTime() - 40 * DAY),
        products: { create: { productId: prodA.id, offerPriceCents: 950 } },
      },
    });
    await mkOrder(`CP-${orderSeq++}`, profitUser.id, { status: "Paid" }, itemB(3));
    await mkOrder(`CX-${orderSeq++}`, profitUser.id, { status: "Cancelled" }, itemB(5));

    // Activity fixtures spanning all four sources, oldest → newest.
    const activityOrder = await mkOrder(`AC-${orderSeq++}`, codUser.id, {}, itemA(1));
    await db.orderEvent.create({
      data: {
        orderId: activityOrder.id,
        type: OrderEventTypes.Placed,
        actorId: profitUser.id,
        actorName: "Alice Admin",
        actorRole: "Admin",
        message: "Order placed",
        amountCents: 1060,
        createdAt: new Date(now.getTime() - 3 * MINUTE),
      },
    });
    await db.accountStatusEvent.create({
      data: {
        userId: cartUserB.id,
        actorId: profitUser.id,
        actorName: "Bob Admin",
        previousActive: true,
        active: false,
        createdAt: new Date(now.getTime() - 2 * MINUTE),
      },
    });
    await db.inventoryAdjustment.create({
      data: {
        requestKey: "adj-1",
        productId: prodA.id,
        actorId: profitUser.id,
        actorName: "Alice Admin",
        delta: -2,
        previousStock: 100,
        newStock: 98,
        expectedUpdatedAt: now,
        reason: "Stocktake correction",
        createdAt: new Date(now.getTime() - MINUTE),
      },
    });

    // ----- tests ------------------------------------------------------------

    await test("profit snapshot counts in-period delivered orders only", async () => {
      const snapshot = await getProfitSnapshot("BDT", "30", now);
      assert.equal(snapshot.deliveredOrders, 1);
      assert.equal(snapshot.revenueCents, 2000);
      assert.equal(snapshot.costCents, 1200);
      assert.equal(snapshot.grossProfitCents, 800);
      assert.ok(Math.abs(snapshot.marginPercent - 40) < 0.01, `margin ${snapshot.marginPercent}`);
      const cat = snapshot.categories.find((c) => c.name === "Test Category");
      assert.ok(cat);
      assert.equal(cat.profitCents, 800);
    });

    await test("money position aggregates wallets, held COD and refunds", async () => {
      const position = await getMoneyPosition("BDT", now);
      assert.equal(position.walletLiabilityCents, 8000);
      assert.equal(position.walletAccounts, 2);
      assert.equal(position.codHeldStoreCurrencyCents, 1300);
      assert.equal(position.codHeldCollections, 2);
      const testCourier = position.codHeld.find((row) => row.courierName === "Test Courier");
      assert.equal(testCourier?.amountCents, 1000);
      const otherCourier = position.codHeld.find((row) => row.courierName === "Other Courier");
      assert.equal(otherCourier?.amountCents, 300, "settled portion must be excluded");
      assert.equal(position.codHeldByCurrency.length, 1);
      assert.equal(position.codHeldByCurrency[0]?.currencyCode, "BDT");
      assert.equal(position.codHeldByCurrency[0]?.amountCents, 1300);
      assert.equal(position.codHeldByCurrency[0]?.collections, 2);
      assert.equal(position.refunds.count, 1, "only in-window store-currency refunds count");
      assert.equal(position.refunds.walletCents, 250);
      assert.equal(position.refunds.gatewayCents, 0, "foreign-currency refunds never leak in");
      assert.equal(position.refunds.totalCents, 250);
      assert.equal(position.refunds.awaitingExternal, 1);
      assert.equal(
        position.refunds.otherCurrencies.count,
        1,
        "the USD refund is reported separately, not dropped",
      );
      assert.equal(position.refunds.otherCurrencies.byCurrency[0]?.currencyCode, "USD");
      assert.equal(position.refunds.otherCurrencies.byCurrency[0]?.amountCents, 500);
    });

    await test("license status: missing, active, expiring, expired, revoked", async () => {
      assert.equal((await getLicenseStatus(now)).state, "missing");

      const license = await db.license.create({
        data: {
          keyHash: "hash-1",
          expiresAt: new Date(now.getTime() + 40 * DAY),
          activatedAt: now,
        },
      });
      assert.equal((await getLicenseStatus(now)).state, "active");

      await db.license.update({
        where: { id: license.id },
        data: { expiresAt: new Date(now.getTime() + 10 * DAY) },
      });
      const expiring = await getLicenseStatus(now);
      assert.equal(expiring.state, "expiring");
      assert.equal(expiring.daysToExpiry, 10);

      await db.license.update({
        where: { id: license.id },
        data: { expiresAt: new Date(now.getTime() - DAY) },
      });
      assert.equal((await getLicenseStatus(now)).state, "expired");

      await db.license.update({
        where: { id: license.id },
        data: { expiresAt: new Date(now.getTime() + 40 * DAY), revokedAt: now },
      });
      assert.equal((await getLicenseStatus(now)).state, "revoked");
    });

    await test("growth signals: abandoned carts exclude fresh and converted", async () => {
      const signals = await getGrowthSignals(now);
      // Stale carts A + guest C; fresh B, unselected D and converted E excluded.
      assert.equal(signals.abandoned.count, 2);
      // Both abandoned carts hold prodA ×2 at 1000.
      assert.equal(signals.abandoned.valueCents, 4000);
      // Cart A was touched 2h ago, the stale guest cart 2 days ago.
      assert.equal(signals.abandoned.buckets.within1h, 0);
      assert.equal(signals.abandoned.buckets.h1to24, 1);
      assert.equal(signals.abandoned.buckets.over24h, 1);
      assert.equal(
        signals.abandoned.buckets.within1h +
          signals.abandoned.buckets.h1to24 +
          signals.abandoned.buckets.over24h,
        signals.abandoned.count,
        "age buckets must partition the abandoned carts",
      );
      assert.equal(signals.abandoned.topProducts[0]?.productId, prodA.id);
      assert.equal(signals.abandoned.topProducts[0]?.units, 4);

      assert.equal(signals.totals.wishlistSaves, 2, "total is catalog-wide, not top-list sum");
      assert.equal(signals.totals.restockWaiting, 3, "total excludes already-notified requests");
      assert.equal(signals.wishlist.find((row) => row.productId === prodA.id)?.saves, 2);
      assert.equal(
        signals.restock.find((row) => row.productId === prodB.id)?.waiting,
        3,
        "already-notified requests must not count as waiting",
      );
      assert.equal(signals.referrals.signups, 1);
      assert.equal(signals.referrals.referrers, 1);
      assert.equal(signals.referrals.qualifyingOrders, 1);
      assert.equal(signals.referrals.rewardCostCents, 4000);
      assert.equal(signals.referrals.unitRewardCents, 4000, "unit cost comes from store settings");

      // Sanity: the converted cart's id is not in an inconsistent state.
      assert.ok(convertedCart.id);
    });

    await test("campaign performance counts non-cancelled sales at offer price", async () => {
      const rows = await getCampaignPerformance("BDT", 30, now);
      const row = rows.find((r) => r.id === campaign.id);
      assert.ok(row);
      assert.equal(row.status, "active");
      assert.equal(row.flashSale, true);
      assert.equal(row.productCount, 1);
      assert.equal(row.units, 3, "cancelled-order units must be excluded");
      assert.equal(row.valueCents, 2400);
      assert.equal(row.regularValueCents, 3000);
      assert.equal(row.offerValueCents, 2400, "3 units × the 800 offer price");
      assert.equal(row.discountGivenCents, 600);
      assert.ok(Math.abs(row.avgDiscountPercent - 20) < 0.01);

      const ended = rows.find((r) => r.id === endedCampaign.id);
      assert.ok(ended, "a campaign ended inside the window is still reported");
      assert.equal(ended.status, "ended");
      assert.equal(ended.units, 3);
      assert.equal(ended.offerValueCents, 2700, "3 units × the 900 offer price");
      assert.ok(
        !rows.some((r) => r.id === staleCampaign.id),
        "campaigns ended longer ago than the window drop out",
      );
    });

    await test("activity trail merges sources, sorts newest first, filters", async () => {
      const all = await getActivityTrail({ limit: 50 }, now);
      assert.equal(all.length, 4);
      assert.deepEqual(
        all.map((entry) => entry.kind),
        ["cash", "stock", "account", "order"],
      );

      // Amounts must carry their own currency, never the store's symbol.
      const cash = all.find((entry) => entry.kind === "cash");
      assert.equal(cash?.amountCents, 200);
      assert.equal(cash?.currencyLabel, "BDT ", "settlements use the settlement currency");
      assert.ok(
        cash?.detail?.includes("variance BDT -3"),
        `variance must be formatted as money, got: ${cash?.detail}`,
      );
      const orderEntry = all.find((entry) => entry.kind === "order");
      assert.equal(orderEntry?.currencyLabel, "৳", "order events follow the order currency");
      const stockEntry = all.find((entry) => entry.kind === "stock");
      assert.equal(stockEntry?.currencyLabel, null, "entries without amounts carry no currency");

      const byAlice = await getActivityTrail({ limit: 50, actor: "alice" }, now);
      assert.equal(byAlice.length, 3, "actor filter must be case-insensitive");

      const stockOnly = await getActivityTrail({ limit: 50, kind: "stock" }, now);
      assert.equal(stockOnly.length, 1);
      assert.equal(stockOnly[0].summary, "Stock -2 · Profit Product");

      const cashByBob = await getActivityTrail({ limit: 50, kind: "cash", actor: "bob" }, now);
      assert.equal(cashByBob.length, 0);
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
