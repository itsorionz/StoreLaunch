import {
  OrderEventTypes,
  OrderStatuses,
  PaymentMethods,
  PaymentAttemptStatuses,
} from "@backend/lib/enums.mjs";
import "server-only";
import { db } from "./db";
import { logEmail } from "./mail";
import { recordOrderEvent } from "./order-events";
import type { SslcommerzValidation } from "./sslcommerz";

type PaymentResult = { ok: true; alreadyPaid?: boolean } | { ok: false; error: string };

/**
 * Resolves a provider transaction id (which is the order number) to the order
 * that the payment boundary operates on. Returns the full row so callers keep
 * today's behavior; the heavy fulfillment work re-fetches under lock.
 */
export async function getOrderByNumber(number: string) {
  return db.order.findUnique({ where: { number } });
}

/** Only provider-validated data may enter this server-only payment boundary. */
export async function fulfillPaidOrder(
  orderId: string,
  validation: SslcommerzValidation,
  valId: string,
): Promise<PaymentResult> {
  const outcome = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { user: true } });
    if (!order) return { result: { ok: false, error: "Order not found" } as PaymentResult };
    async function review(error: string) {
      if (validation.isValid && valId)
        await tx.paymentAttempt.updateMany({
          where: { orderId, status: { not: PaymentAttemptStatuses.Succeeded } },
          data: {
            status: PaymentAttemptStatuses.ReviewRequired,
            requiresManualReview: true,
            lastError: error,
            lastCheckedAt: new Date(),
          },
        });
      if (validation.isValid && valId)
        await recordOrderEvent(tx, {
          orderId,
          type: OrderEventTypes.PaymentReviewRequired,
          source: "PAYMENT_PROVIDER",
          message: `${error}. Provider validation reference: ${valId}`,
          dedupeKey: `review:${orderId}:${valId}`,
        });
      return { result: { ok: false, error } as PaymentResult };
    }
    if (!validation.isValid || !valId || order.number !== validation.tranId)
      return review("Transaction mismatch");
    if (order.paymentMethod !== PaymentMethods.GATEWAY)
      return review("Order does not use gateway payment");
    const amount = validation.amount;
    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      Math.round(amount * 100) !== order.totalCents - order.walletPaidCents ||
      amount <= 0
    )
      return review("Payment amount mismatch");
    if (!order.currencyCode)
      return review(
        "Historical order currency is unrecorded; admin review is required before payment confirmation",
      );
    if (validation.currencyType !== order.currencyCode || validation.highRisk)
      return review("Payment currency mismatch or verification required");
    if (
      (
        [
          OrderStatuses.Paid,
          OrderStatuses.Processing,
          OrderStatuses.Confirmed,
          OrderStatuses.Packing,
          OrderStatuses.Packed,
          OrderStatuses.Shipped,
          OrderStatuses.Delivered,
        ] as readonly string[]
      ).includes(order.status)
    ) {
      return order.paymentValId === valId
        ? { result: { ok: true, alreadyPaid: true } as PaymentResult }
        : review("Payment reference mismatch");
    }
    if (order.status !== OrderStatuses.Pending)
      return review("Order is no longer awaiting payment; reconcile this payment with support");
    const changed = await tx.order.updateMany({
      where: {
        id: orderId,
        status: OrderStatuses.Pending,
        walletPaidCents: order.walletPaidCents,
        currencyCode: order.currencyCode,
      },
      data: { status: OrderStatuses.Paid, paidAt: new Date(), paymentValId: valId },
    });
    if (!changed.count) {
      const fresh = await tx.order.findUnique({ where: { id: orderId } });
      return fresh &&
        (
          [
            OrderStatuses.Paid,
            OrderStatuses.Processing,
            OrderStatuses.Confirmed,
            OrderStatuses.Packing,
            OrderStatuses.Packed,
            OrderStatuses.Shipped,
            OrderStatuses.Delivered,
          ] as readonly string[]
        ).includes(fresh.status) &&
        fresh.paymentValId === valId
        ? { result: { ok: true, alreadyPaid: true } as PaymentResult }
        : review("Order changed while payment was being confirmed; reconciliation required");
    }
    await recordOrderEvent(tx, {
      orderId,
      type: OrderEventTypes.PaymentConfirmed,
      source: "PAYMENT_PROVIDER",
      fromStatus: OrderStatuses.Pending,
      toStatus: OrderStatuses.Paid,
      amountCents: Math.round(amount * 100),
      message: `Gateway payment confirmed in ${order.currencyCode}`,
    });
    await tx.paymentAttempt.updateMany({
      where: { orderId },
      data: {
        status: PaymentAttemptStatuses.Succeeded,
        requiresManualReview: false,
        gatewayUrl: null,
        lastError: null,
        lastCheckedAt: new Date(),
      },
    });
    return { result: { ok: true } as PaymentResult, email: order.user.email, number: order.number };
  });
  if (outcome.result.ok && "email" in outcome)
    logEmail({
      to: outcome.email,
      subject: `Order ${outcome.number} confirmed`,
      body: `Order ${outcome.number} confirmed. Status: ${OrderStatuses.Paid}.`,
    });
  return outcome.result;
}
