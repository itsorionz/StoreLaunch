import { config } from "dotenv";
import { createPrismaClient } from "../lib/prisma-client";
import { PrismaClient } from "@backend/generated/prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OrderStatuses,
  PaymentMethods,
  PaymentAttemptStatuses,
  OrderEventTypes,
  WalletTransactionTypes,
} from "../lib/enums.mjs";
import type { CartData } from "../lib/cart";

config({ quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  const name = `test_payments_${randomUUID().replaceAll("-", "")}`;
  const admin = createPrismaClient();
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  process.env.SSLCOMMERZ_STORE_ID = "isolated-test";
  process.env.SSLCOMMERZ_STORE_PASSWORD = "isolated-test";
  process.env.SSLCOMMERZ_SANDBOX = "true";
  const originalFetch = globalThis.fetch;
  let store: PrismaClient | undefined;
  try {
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      env: process.env,
      stdio: "pipe",
    });
    const { db } = await import("../lib/db");
    store = db;
    const { createReservedOrder } = await import("../lib/order-placement");
    const { resumeOrderPayment, recoverOrderPayment, runPaymentRecoveryBatch } =
      await import("../lib/payment-recovery");
    const { fulfillPaidOrder } = await import("../lib/fulfillment");
    const { transitionOrder } = await import("../lib/order-lifecycle");
    const { querySslcommerzPayment } = await import("../lib/sslcommerz");
    const category = await db.category.create({ data: { name: "Payments", slug: "payments" } });
    async function fixture(
      walletCents = 0,
      paymentMethod:
        typeof PaymentMethods.COD | typeof PaymentMethods.GATEWAY = PaymentMethods.GATEWAY,
    ) {
      const key = randomUUID();
      const user = await db.user.create({
        data: {
          name: "Payment customer",
          email: `${key}@payment.invalid`,
          passwordHash: "unused",
          wallet: { create: { balanceCents: 10000 } },
        },
      });
      const product = await db.product.create({
        data: {
          name: "Payment product",
          slug: key,
          categoryId: category.id,
          stock: 10,
          priceCents: 1000,
        },
      });
      const cart = await db.cart.create({
        data: { userId: user.id, items: { create: { productId: product.id, quantity: 2 } } },
        include: { items: true },
      });
      const snapshot: CartData = {
        id: cart.id,
        items: [{ id: cart.items[0].id, quantity: 2, selected: true, product }],
        subtotalCents: 2000,
        itemCount: 2,
      };
      const order = await createReservedOrder({
        userId: user.id,
        number: `P${key.replaceAll("-", "").slice(0, 20)}`,
        cart: snapshot,
        shippingCents: 0,
        walletCents,
        paymentMethod,
        currencyCode: "BDT",
        currencySymbol: "Tk",
        recipientName: user.name,
        phone: "01700000000",
        line1: "Payment road",
        city: "Dhaka",
      });
      return { user, product, order };
    }
    async function due(orderId: string, expire = true) {
      await db.paymentAttempt.update({
        where: { orderId },
        data: { nextCheckAt: new Date(0), ...(expire ? { expiresAt: new Date(0) } : {}) },
      });
    }
    type Fixture = Awaited<ReturnType<typeof fixture>>;
    function provider(f: Fixture, outcome: string, overrides: Record<string, unknown> = {}) {
      let initiated = 0,
        queried = 0;
      globalThis.fetch = async (input) => {
        const target = String(input);
        if (target.includes("gwprocess")) {
          initiated++;
          return Response.json({
            status: "SUCCESS",
            sessionkey: `session-${f.order.id}`,
            GatewayPageURL: "https://sandbox.sslcommerz.com/payment",
          });
        }
        if (target.includes("merchantTransIDvalidation")) {
          queried++;
          return Response.json({
            APIConnect: "DONE",
            status: outcome,
            sessionkey: `session-${f.order.id}`,
            tran_id: f.order.number,
            val_id: `validation-${f.order.id}`,
            ...overrides,
          });
        }
        if (target.includes("validationserver"))
          return Response.json({
            status: "VALID",
            tran_id: f.order.number,
            currency_amount: (f.order.totalCents - f.order.walletPaidCents) / 100,
            currency_type: "BDT",
            risk_level: "0",
            ...overrides,
          });
        throw new Error("Unexpected external request");
      };
      return {
        get initiated() {
          return initiated;
        },
        get queried() {
          return queried;
        },
      };
    }
    const valid = (f: Fixture) => ({
      isValid: true,
      status: "VALID",
      tranId: f.order.number,
      amount: (f.order.totalCents - f.order.walletPaidCents) / 100,
      currencyType: "BDT",
      highRisk: false,
    });
    await test("gateway reservation persists a deadline atomically; COD and wallet-only orders have no attempt", async () => {
      const f = await fixture(500);
      const attempt = await db.paymentAttempt.findUniqueOrThrow({ where: { orderId: f.order.id } });
      assert.equal(attempt.status, PaymentAttemptStatuses.Created);
      assert.ok(attempt.expiresAt.getTime() > Date.now() + 29 * 60000);
      assert.equal(
        await db.paymentAttempt.count({
          where: { orderId: (await fixture(0, PaymentMethods.COD)).order.id },
        }),
        0,
      );
      assert.equal(
        await db.paymentAttempt.count({ where: { orderId: (await fixture(2000)).order.id } }),
        0,
      );
    });
    await test("concurrent initiation claims once and repeat resume reuses the persisted session", async () => {
      const f = await fixture();
      const mock = provider(f, "PENDING");
      const results = await Promise.all([
        resumeOrderPayment(f.order.id),
        resumeOrderPayment(f.order.id),
      ]);
      assert.equal(mock.initiated, 1);
      assert.ok(results.some((result) => result.gatewayUrl));
      const retry = await resumeOrderPayment(f.order.id);
      assert.equal(retry.gatewayUrl, "https://sandbox.sslcommerz.com/payment");
      assert.equal(mock.initiated, 1);
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { orderId: f.order.id } })).sessionKey,
        `session-${f.order.id}`,
      );
    });
    await test("timeout after provider acceptance never starts a second session and keeps tender reserved", async () => {
      const f = await fixture(500);
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        throw new Error("Lost response after acceptance");
      };
      assert.equal((await resumeOrderPayment(f.order.id)).ok, false);
      assert.equal((await resumeOrderPayment(f.order.id)).ok, false);
      assert.equal(calls, 1);
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { orderId: f.order.id } })).status,
        PaymentAttemptStatuses.Unknown,
      );
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { userId: f.user.id } })).balanceCents,
        9500,
      );
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 8);
    });
    await test("never-started expiry restores stock and wallet exactly once across overlapping workers", async () => {
      const f = await fixture(500);
      await due(f.order.id);
      globalThis.fetch = async () => {
        throw new Error("Must not contact provider for an unstarted reservation");
      };
      await Promise.all([recoverOrderPayment(f.order.id), recoverOrderPayment(f.order.id)]);
      assert.equal(
        (await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status,
        OrderStatuses.Cancelled,
      );
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 10);
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { userId: f.user.id } })).balanceCents,
        10000,
      );
      assert.equal(
        await db.walletTransaction.count({
          where: { orderId: f.order.id, type: WalletTransactionTypes.REFUND },
        }),
        1,
      );
      assert.equal((await resumeOrderPayment(f.order.id)).ok, false);
    });
    await test("provider-confirmed failure safely cancels and releases a started reservation", async () => {
      const f = await fixture(500);
      provider(f, "FAILED");
      await resumeOrderPayment(f.order.id);
      await due(f.order.id);
      assert.equal((await recoverOrderPayment(f.order.id)).ok, true);
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { orderId: f.order.id } })).status,
        PaymentAttemptStatuses.Expired,
      );
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 10);
    });
    await test("pending or unavailable provider after deadline retains stock and records one review event", async () => {
      const f = await fixture(500);
      const mock = provider(f, "PENDING");
      await resumeOrderPayment(f.order.id);
      await due(f.order.id);
      await Promise.all([recoverOrderPayment(f.order.id), recoverOrderPayment(f.order.id)]);
      assert.equal(mock.queried, 1);
      assert.equal(
        (await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status,
        OrderStatuses.Pending,
      );
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 8);
      assert.equal(
        await db.orderEvent.count({
          where: { orderId: f.order.id, type: OrderEventTypes.PaymentReviewRequired },
        }),
        1,
      );
      assert.equal((await transitionOrder(f.order.id, OrderStatuses.Cancelled)).ok, false);
    });
    await test("missed callback is recovered through server query plus independent validation", async () => {
      const f = await fixture(500);
      provider(f, "VALID");
      await resumeOrderPayment(f.order.id);
      await due(f.order.id);
      assert.equal((await recoverOrderPayment(f.order.id)).ok, true);
      assert.equal(
        (await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status,
        OrderStatuses.Paid,
      );
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { orderId: f.order.id } })).status,
        PaymentAttemptStatuses.Succeeded,
      );
      assert.equal(
        await db.walletTransaction.count({
          where: { orderId: f.order.id, type: WalletTransactionTypes.REFUND },
        }),
        0,
      );
      assert.equal(
        (await fulfillPaidOrder(f.order.id, valid(f), `validation-${f.order.id}`)).ok,
        true,
      );
      assert.equal(
        await db.orderEvent.count({
          where: { orderId: f.order.id, type: OrderEventTypes.PaymentConfirmed },
        }),
        1,
      );
    });
    await test("an overdue pending outcome can later release on authoritative failure", async () => {
      const f = await fixture(500);
      provider(f, "PENDING");
      await resumeOrderPayment(f.order.id);
      await due(f.order.id);
      await recoverOrderPayment(f.order.id);
      provider(f, "FAILED");
      await due(f.order.id);
      assert.equal((await recoverOrderPayment(f.order.id)).ok, true);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 10);
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { userId: f.user.id } })).balanceCents,
        10000,
      );
    });
    await test("amount mismatch needs review and cannot release reserved inventory", async () => {
      const f = await fixture();
      provider(f, "VALID", { currency_amount: 999 });
      await resumeOrderPayment(f.order.id);
      await due(f.order.id);
      assert.equal((await recoverOrderPayment(f.order.id)).ok, false);
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { orderId: f.order.id } })).status,
        PaymentAttemptStatuses.ReviewRequired,
      );
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 8);
      provider(f, "FAILED");
      await due(f.order.id);
      await recoverOrderPayment(f.order.id);
      assert.equal(
        (await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status,
        OrderStatuses.Pending,
      );
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { orderId: f.order.id } }))
          .requiresManualReview,
        true,
      );
    });
    await test("late validated payment after expiry creates review without reviving or reserving cancelled order", async () => {
      const f = await fixture(500);
      await due(f.order.id);
      await recoverOrderPayment(f.order.id);
      const result = await fulfillPaidOrder(f.order.id, valid(f), `late-${f.order.id}`);
      assert.equal(result.ok, false);
      assert.equal(
        (await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status,
        OrderStatuses.Cancelled,
      );
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { orderId: f.order.id } })).status,
        PaymentAttemptStatuses.ReviewRequired,
      );
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 10);
      assert.equal(
        (await db.wallet.findUniqueOrThrow({ where: { userId: f.user.id } })).balanceCents,
        10000,
      );
    });
    await test("callback racing expiry preserves stock and wallet conservation", async () => {
      const f = await fixture(500);
      await due(f.order.id);
      await Promise.all([
        recoverOrderPayment(f.order.id),
        fulfillPaidOrder(f.order.id, valid(f), `race-${f.order.id}`),
      ]);
      const current = await db.order.findUniqueOrThrow({ where: { id: f.order.id } });
      const stock = (await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock;
      const balance = (await db.wallet.findUniqueOrThrow({ where: { userId: f.user.id } }))
        .balanceCents;
      assert.ok(
        current.status === OrderStatuses.Paid || current.status === OrderStatuses.Cancelled,
      );
      assert.equal(stock, current.status === OrderStatuses.Paid ? 8 : 10);
      assert.equal(balance, current.status === OrderStatuses.Paid ? 9500 : 10000);
    });
    await test("missing, mismatched or malformed query data is never a release signal", async () => {
      for (const response of [
        { APIConnect: "DONE", no_of_trans_found: 0, element: [] },
        { APIConnect: "FAILED", status: "FAILED" },
        {
          APIConnect: "DONE",
          no_of_trans_found: 1,
          element: [{ status: "FAILED", tran_id: "other" }],
        },
        {
          APIConnect: "DONE",
          no_of_trans_found: 2,
          element: [{ status: "FAILED", tran_id: "expected" }],
        },
      ]) {
        globalThis.fetch = async () => Response.json(response);
        assert.equal((await querySslcommerzPayment("expected")).kind, "Unknown");
      }
    });
    await test("unknown initiation can recover by transaction ID after restart with no session key", async () => {
      const f = await fixture();
      await db.paymentAttempt.update({
        where: { orderId: f.order.id },
        data: { status: PaymentAttemptStatuses.Initiating },
      });
      await due(f.order.id);
      globalThis.fetch = async (input) =>
        String(input).includes("merchantTransIDvalidation")
          ? Response.json({
              APIConnect: "DONE",
              no_of_trans_found: 1,
              element: [
                { tran_id: f.order.number, status: "VALID", val_id: `recovered-${f.order.id}` },
              ],
            })
          : Response.json({
              status: "VALID",
              tran_id: f.order.number,
              currency_amount: 20,
              currency_type: "BDT",
              risk_level: "0",
            });
      assert.equal((await recoverOrderPayment(f.order.id)).ok, true);
      assert.equal(
        (await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status,
        OrderStatuses.Paid,
      );
    });
    await test("worker finds durable due reservations and does not expire COD or paid orders", async () => {
      // Isolate the queue from intentionally unresolved fixtures in earlier checks.
      await db.paymentAttempt.updateMany({ data: { nextCheckAt: new Date(Date.now() + 600000) } });
      const f = await fixture();
      await due(f.order.id);
      const results = await runPaymentRecoveryBatch();
      assert.equal(results.length, 1);
      assert.equal(results[0].orderId, f.order.id);
      assert.equal(
        (await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status,
        OrderStatuses.Cancelled,
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
    await store?.$disconnect();
    // PostgreSQL's short-lived maintenance workers may briefly prevent a non-superuser FORCE drop.
    for (let attempt = 0; ; attempt++) {
      try {
        await admin.$executeRawUnsafe(`DROP DATABASE "${name}"`);
        break;
      } catch (error) {
        if (attempt >= 9) throw error;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    await admin.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
