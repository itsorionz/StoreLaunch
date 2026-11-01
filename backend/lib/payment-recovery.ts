import "server-only";
import { db } from "./db";
import {
  AfterSalesKinds,
  AfterSalesStatuses,
  OrderStatuses,
  PaymentMethods,
  PaymentAttemptStatuses,
  OrderEventTypes,
} from "./enums.mjs";
import { PaymentRecoveryPolicy } from "./payment-policy";
import { initiateSslcommerzSession, querySslcommerzPayment } from "./sslcommerz";
import { fulfillPaidOrder } from "./fulfillment";
import { transitionOrder } from "./order-lifecycle";
import { recordOrderEvent } from "./order-events";

type PaymentActionResult = { ok: boolean; message: string; gatewayUrl?: string };

/** Claim before the external call. A lost response is queried, never initiated a second time. */
export async function resumeOrderPayment(orderId: string): Promise<PaymentActionResult> {
  const claimed = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { paymentAttempt: true, user: true, items: true },
    });
    if (
      !order ||
      order.status !== OrderStatuses.Pending ||
      order.paymentMethod !== PaymentMethods.GATEWAY ||
      !order.currencyCode
    )
      return null;
    const attempt = order.paymentAttempt;
    if (!attempt || attempt.expiresAt <= new Date()) return null;
    if (
      await tx.afterSalesRequest.count({
        where: {
          orderId,
          kind: AfterSalesKinds.Cancellation,
          status: { in: [AfterSalesStatuses.Requested, AfterSalesStatuses.Approved] },
        },
      })
    )
      return null;
    if (attempt.status === PaymentAttemptStatuses.Ready && attempt.gatewayUrl)
      return { order, initiate: false };
    if (attempt.status !== PaymentAttemptStatuses.Created) return null;
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: PaymentAttemptStatuses.Initiating,
        nextCheckAt: new Date(Date.now() + PaymentRecoveryPolicy.recheckMs),
      },
    });
    return { order, initiate: true };
  });
  if (!claimed)
    return {
      ok: false,
      message:
        "Payment cannot be resumed. Check payment status or contact support before placing another order",
    };
  if (!claimed.initiate)
    return {
      ok: true,
      message: "Continue your existing payment",
      gatewayUrl: claimed.order.paymentAttempt!.gatewayUrl!,
    };
  const order = claimed.order;
  const session = await initiateSslcommerzSession({
    tranId: order.number,
    orderId,
    amount: (order.totalCents - order.walletPaidCents) / 100,
    currency: order.currencyCode!,
    customerName: order.recipientName,
    customerEmail: order.user.email,
    customerPhone: order.phone,
    address: [order.line1, order.line2].filter(Boolean).join(", "),
    city: order.city,
    postal: order.postal ?? undefined,
    productName: order.items.length === 1 ? order.items[0].name : `${order.items.length} items`,
    productCategory: "General",
    successUrl: "/api/payments/sslcommerz/return",
    failUrl: "/api/payments/sslcommerz/return",
    cancelUrl: "/api/payments/sslcommerz/return",
    ipnUrl: "/api/payments/sslcommerz/ipn",
  }).catch(() => ({
    ok: false as const,
    error: "Provider response was interrupted",
    uncertain: true,
  }));
  const persisted = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const current = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (current.status !== OrderStatuses.Pending) return false;
    const changed = await tx.paymentAttempt.updateMany({
      where: { orderId, status: PaymentAttemptStatuses.Initiating },
      data: session.ok
        ? {
            status: PaymentAttemptStatuses.Ready,
            sessionKey: session.sessionKey,
            gatewayUrl: session.gatewayUrl,
            lastError: null,
          }
        : {
            status: session.uncertain
              ? PaymentAttemptStatuses.Unknown
              : PaymentAttemptStatuses.Failed,
            lastError: session.error.slice(0, 500),
          },
    });
    return changed.count === 1;
  });
  if (!persisted)
    return {
      ok: false,
      message: "Order payment status changed. Refresh your order before continuing",
    };
  if (session.ok) return { ok: true, message: "Continue payment", gatewayUrl: session.gatewayUrl };
  if (!session.uncertain) {
    const cancellation = await transitionOrder(orderId, OrderStatuses.Cancelled);
    return {
      ok: false,
      message: cancellation.ok
        ? "Payment could not start. The order was cancelled and any wallet credit restored. You can order again"
        : cancellation.error,
    };
  }
  return {
    ok: false,
    message:
      "The provider response is uncertain. Use Check payment status before trying another order",
  };
}

/** Lease provider polling so overlapping workers and repeated clicks do not flood the gateway. */
export async function recoverOrderPayment(orderId: string): Promise<PaymentActionResult> {
  const now = new Date();
  const claim = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { paymentAttempt: true },
    });
    const attempt = order?.paymentAttempt;
    if (
      !order ||
      !attempt ||
      order.status !== OrderStatuses.Pending ||
      order.paymentMethod !== PaymentMethods.GATEWAY
    )
      return null;
    // Created is never sent to the provider; Failed is an authoritative initiation/query failure.
    if (
      attempt.status === PaymentAttemptStatuses.Failed ||
      (attempt.status === PaymentAttemptStatuses.Created && attempt.expiresAt <= now)
    ) {
      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: PaymentAttemptStatuses.Failed,
          nextCheckAt: new Date(now.getTime() + PaymentRecoveryPolicy.recheckMs),
        },
      });
      return { order, release: true };
    }
    if (attempt.status === PaymentAttemptStatuses.Created || attempt.nextCheckAt > now) return null;
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        nextCheckAt: new Date(now.getTime() + PaymentRecoveryPolicy.recheckMs),
        lastCheckedAt: now,
      },
    });
    return { order, release: false };
  });
  if (!claim)
    return {
      ok: false,
      message:
        "No payment check is due. Refresh the order or wait up to five minutes before checking again",
    };
  if (claim.release) {
    const result = await transitionOrder(orderId, OrderStatuses.Cancelled);
    return {
      ok: result.ok,
      message: result.ok
        ? "Unpaid order cancelled; stock and wallet credit restored"
        : result.error,
    };
  }
  const query = await querySslcommerzPayment(
    claim.order.number,
    claim.order.paymentAttempt!.sessionKey,
  );
  if (query.kind === "Paid") {
    const result = await fulfillPaidOrder(orderId, query.validation, query.valId);
    return { ok: result.ok, message: result.ok ? "Payment confirmed" : result.error };
  }
  const releasable = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { paymentAttempt: true },
    });
    if (
      order.status !== OrderStatuses.Pending ||
      order.paymentAttempt?.status === PaymentAttemptStatuses.Succeeded
    )
      return false;
    // Never erase a validation discrepancy recorded by a concurrent callback.
    if (order.paymentAttempt?.requiresManualReview) return false;
    const overdue = order.paymentAttempt!.expiresAt <= now;
    await tx.paymentAttempt.update({
      where: { orderId },
      data: {
        status:
          query.kind === "Failed"
            ? PaymentAttemptStatuses.Failed
            : overdue
              ? PaymentAttemptStatuses.ReviewRequired
              : PaymentAttemptStatuses.Unknown,
        lastError:
          query.kind === "Failed"
            ? "Provider confirmed payment failure"
            : "Provider has not confirmed a final payment outcome; stock remains reserved",
        lastCheckedAt: new Date(),
      },
    });
    if (overdue && query.kind !== "Failed")
      await recordOrderEvent(tx, {
        orderId,
        type: OrderEventTypes.PaymentReviewRequired,
        message:
          "Payment reservation deadline passed without a final provider outcome. Stock and wallet remain reserved for reconciliation",
        dedupeKey: `payment-expiry-review:${orderId}`,
      });
    return query.kind === "Failed";
  });
  if (releasable) {
    const result = await transitionOrder(orderId, OrderStatuses.Cancelled);
    return {
      ok: result.ok,
      message: result.ok
        ? "Provider confirmed failure; order cancelled and stock and wallet credit restored"
        : result.error,
    };
  }
  return {
    ok: false,
    message:
      "Payment needs verification. Stock and wallet remain reserved; contact support if the provider shows a debit",
  };
}

export async function runPaymentRecoveryBatch() {
  const attempts = await db.paymentAttempt.findMany({
    where: {
      nextCheckAt: { lte: new Date() },
      status: { notIn: [PaymentAttemptStatuses.Succeeded, PaymentAttemptStatuses.Expired] },
      order: { status: OrderStatuses.Pending },
    },
    orderBy: { nextCheckAt: "asc" },
    take: PaymentRecoveryPolicy.batchSize,
    select: { orderId: true },
  });
  const results = [];
  for (const attempt of attempts) {
    try {
      results.push({ orderId: attempt.orderId, ...(await recoverOrderPayment(attempt.orderId)) });
    } catch (error) {
      console.error("[payment-recovery] Batch item failed", {
        orderId: attempt.orderId,
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      results.push({
        orderId: attempt.orderId,
        ok: false,
        message: "Recovery failed; retry or investigate server logs",
      });
    }
  }
  return results;
}
