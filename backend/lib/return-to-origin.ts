import "server-only";
import { db } from "./db";
import {
  AfterSalesStatuses,
  OrderEventTypes,
  OrderStatuses,
  PaymentMethods,
  RefundStatuses,
  RefundTenders,
  ReturnDispositions,
  WalletTransactionTypes,
} from "./enums.mjs";
import { recordOrderEvent, type OrderActor } from "./order-events";
import { creditWalletBalance } from "./wallet-balance";
import { applyWarehouseStockDelta } from "./stock-ledger";
import { logger } from "./logger";

const log = logger.child({ scope: "return-to-origin" });

export type ReturnToOriginResult = { ok: boolean; number?: string; error?: string };

export async function startReturnToOrigin(
  orderId: string,
  reason: string,
  actor: OrderActor,
): Promise<ReturnToOriginResult> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { deliveryAttempts: { select: { id: true } } },
    });
    if (!order) return { ok: false, error: "Order not found" };
    if (order.status !== OrderStatuses.Shipped)
      return { ok: false, error: "Only an out-for-delivery order can be returned to the store" };
    if (!order.deliveryAttempts.length)
      return {
        ok: false,
        error: "Record at least one failed delivery attempt before starting return-to-origin",
      };
    const openRequest = await tx.afterSalesRequest.count({
      where: {
        orderId,
        status: {
          in: [
            AfterSalesStatuses.Requested,
            AfterSalesStatuses.Approved,
            AfterSalesStatuses.Received,
            AfterSalesStatuses.Inspected,
          ],
        },
      },
    });
    if (openRequest)
      return {
        ok: false,
        error: "Resolve the open customer request before returning this order to the store",
      };
    const changed = await tx.order.updateMany({
      where: { id: orderId, status: OrderStatuses.Shipped },
      data: { status: OrderStatuses.ReturningToOrigin },
    });
    if (!changed.count) return { ok: false, error: "Order changed. Refresh and try again" };
    await recordOrderEvent(tx, {
      orderId,
      type: OrderEventTypes.ReturnToOriginStarted,
      actor,
      fromStatus: OrderStatuses.Shipped,
      toStatus: OrderStatuses.ReturningToOrigin,
      message: `Return to origin started after ${order.deliveryAttempts.length} failed delivery attempt${order.deliveryAttempts.length === 1 ? "" : "s"}. ${reason}`,
    });
    return { ok: true, number: order.number };
  });
}

export async function completeReturnToOrigin(
  orderId: string,
  externalReference: string,
  disposition: string,
  conditionNote: string,
  actor: OrderActor,
): Promise<ReturnToOriginResult> {
  if (
    !Object.values(ReturnDispositions).includes(
      disposition as (typeof ReturnDispositions)[keyof typeof ReturnDispositions],
    ) ||
    conditionNote.trim().length < 5 ||
    conditionNote.trim().length > 500
  )
    return {
      ok: false,
      error: "Inspect the returned parcel and record its condition before closing the order",
    };
  return db
    .$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order) return { ok: false, error: "Order not found" };
      if (order.status !== OrderStatuses.ReturningToOrigin)
        return { ok: false, error: "This order is not awaiting return-to-origin receipt" };
      if (order.paymentMethod === PaymentMethods.GATEWAY && !order.paidAt)
        return {
          ok: false,
          error:
            "Online payment is not verified on this order. Reconcile the payment before closing the return",
        };
      const gatewayRefund =
        order.paymentMethod === PaymentMethods.GATEWAY && order.paidAt
          ? Math.max(0, order.totalCents - order.walletPaidCents)
          : 0;
      if (gatewayRefund > 0 && externalReference.trim().length < 5)
        return {
          ok: false,
          error: "Complete the gateway refund and record its reference before closing the return",
        };
      if ((gatewayRefund > 0 || order.walletPaidCents > 0) && !order.currencyCode)
        return {
          ok: false,
          error: "Order currency must be reconciled before recording this refund",
        };
      const changed = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatuses.ReturningToOrigin },
        data: { status: OrderStatuses.Cancelled },
      });
      if (!changed.count) return { ok: false, error: "Order changed. Refresh and try again" };
      if (disposition === ReturnDispositions.Resellable)
        for (const item of [...order.items].sort((a, b) =>
          a.productId.localeCompare(b.productId),
        )) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
          if (order.warehouseId)
            await applyWarehouseStockDelta(tx, {
              warehouseId: order.warehouseId,
              productId: item.productId,
              delta: item.quantity,
              reason: "Return to origin restock",
              reasonCode: "Return",
              referenceId: order.number,
              actorId: actor.id,
              actorName: actor.name,
            });
        }
      if (gatewayRefund > 0)
        await tx.refundRecord.create({
          data: {
            orderId,
            tender: RefundTenders.Gateway,
            status: RefundStatuses.Completed,
            amountCents: gatewayRefund,
            currencyCode: order.currencyCode!,
            externalReference: externalReference.trim(),
            completedById: actor.id,
            completedByName: actor.name,
          },
        });
      if (order.walletPaidCents > 0) {
        const wallet = await creditWalletBalance(tx, order.userId, order.walletPaidCents);
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            orderId,
            amountCents: order.walletPaidCents,
            balanceAfterCents: wallet.balanceCents,
            type: WalletTransactionTypes.REFUND,
            note: "Return-to-origin wallet refund",
          },
        });
        await tx.refundRecord.create({
          data: {
            orderId,
            tender: RefundTenders.Wallet,
            status: RefundStatuses.Completed,
            amountCents: order.walletPaidCents,
            currencyCode: order.currencyCode!,
            completedById: actor.id,
            completedByName: actor.name,
          },
        });
        await recordOrderEvent(tx, {
          orderId,
          type: OrderEventTypes.WalletRefunded,
          actor,
          amountCents: order.walletPaidCents,
          message: "Wallet tender refunded after return-to-origin receipt",
        });
      }
      await recordOrderEvent(tx, {
        orderId,
        type: OrderEventTypes.ReturnToOriginReceived,
        actor,
        fromStatus: OrderStatuses.ReturningToOrigin,
        toStatus: OrderStatuses.Cancelled,
        message: `Returned parcel received and inspected (${disposition}). ${conditionNote.trim()} ${disposition === ReturnDispositions.Resellable ? "Items were returned to available stock." : "Items were excluded from available stock for manual inventory reconciliation."}`,
      });
      await recordOrderEvent(tx, {
        orderId,
        type: OrderEventTypes.Cancelled,
        actor,
        fromStatus: OrderStatuses.ReturningToOrigin,
        toStatus: OrderStatuses.Cancelled,
        message: "Order closed after return-to-origin receipt",
      });
      return { ok: true, number: order.number };
    })
    .catch((error: unknown) => {
      if (error instanceof Error && error.message === "WALLET_BALANCE_LIMIT") {
        log.warn("completeReturnToOrigin rejected", { code: "WALLET_BALANCE_LIMIT", orderId });
        return {
          ok: false,
          error:
            "Return was not closed because refunding the wallet would exceed its supported balance. Contact finance",
        };
      }
      log.error("completeReturnToOrigin failed", { error, orderId, disposition });
      return Promise.reject(error);
    });
}
