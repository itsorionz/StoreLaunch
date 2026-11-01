import {
  OrderEventTypes,
  OrderStatuses,
  PaymentMethods,
  PaymentAttemptStatuses,
  Roles,
  WalletTransactionTypes,
} from "@backend/lib/enums.mjs";
import "server-only";
import { lockAccountStatus } from "./account-status";
import { db } from "./db";
import { canAssignDelivery, transitionError } from "./order-policy";
import { recordOrderEvent, type OrderActor } from "./order-events";
import type { OrderStatus, OrderEventType } from "@backend/generated/prisma/client";
import { PREPARATION_STATUSES, ORDER_STATUS_LABELS } from "./order-status";
import { creditWalletBalance } from "./wallet-balance";
import { applyWarehouseStockDelta } from "./stock-ledger";
import { rewardDeliveredReferral } from "./referrals";

type Result = { ok: true; number: string } | { ok: false; error: string };

/** Status is the transaction's claim: only one competing transition can win. */
export type HandoverProof = {
  receivedBy: string;
  relationship: string;
  note: string;
  photoKey?: string;
  photoMime?: string;
  photoData?: Uint8Array<ArrayBuffer>;
};
export async function transitionOrder(
  orderId: string,
  next: string,
  options: {
    riderId?: string;
    cashCollected?: boolean;
    actor?: OrderActor;
    proof?: HandoverProof;
  } = {},
): Promise<Result> {
  return db
    .$transaction(async (tx): Promise<Result> => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order) return { ok: false, error: "Order not found" };
      if ((PREPARATION_STATUSES as readonly string[]).includes(next)) {
        if (options.actor?.role !== Roles.Admin)
          return { ok: false, error: "Only an administrator can update order preparation" };
        if (order.status === next) return { ok: true, number: order.number };
      }
      if (
        options.riderId &&
        (order.riderId !== options.riderId ||
          !([OrderStatuses.Shipped, OrderStatuses.Delivered] as readonly string[]).includes(next))
      ) {
        return { ok: false, error: "This order is not assigned to you" };
      }
      if (next === OrderStatuses.Cancelled && order.status === OrderStatuses.Cancelled)
        return { ok: true, number: order.number };
      if (
        next === OrderStatuses.Cancelled &&
        (await tx.afterSalesRequest.count({
          where: { orderId, status: { in: ["Requested", "Approved"] } },
        }))
      )
        return {
          ok: false,
          error: "Resolve the customer's open cancellation request from the after-sales panel",
        };
      if (
        next === OrderStatuses.Cancelled &&
        order.paymentMethod === PaymentMethods.GATEWAY &&
        order.status === OrderStatuses.Pending
      ) {
        const attempt = await tx.paymentAttempt.findUnique({ where: { orderId } });
        if (
          !attempt ||
          attempt.requiresManualReview ||
          !(
            [
              PaymentAttemptStatuses.Created,
              PaymentAttemptStatuses.Failed,
              PaymentAttemptStatuses.Expired,
            ] as readonly string[]
          ).includes(attempt.status)
        )
          return {
            ok: false,
            error:
              "Check the provider payment status before cancellation. Payment may still be in progress",
          };
      }
      const error = transitionError(order, next, options.cashCollected === true);
      if (error) return { ok: false, error };
      const cashDue =
        order.paymentMethod === PaymentMethods.COD ? order.totalCents - order.walletPaidCents : 0;
      if (
        next === OrderStatuses.Delivered &&
        cashDue > 0 &&
        (!options.actor?.id ||
          !([Roles.Admin, Roles.Rider] as readonly string[]).includes(options.actor.role))
      )
        return { ok: false, error: "An identified courier or admin must confirm cash collection" };
      if (next === OrderStatuses.Delivered && cashDue > 0 && !order.currencyCode)
        return {
          ok: false,
          error:
            "An admin must confirm this legacy order's currency before cash collection can be recorded",
        };
      if (
        next === OrderStatuses.Delivered &&
        cashDue > 0 &&
        !order.riderId &&
        !order.deliveryCompanyId
      )
        return {
          ok: false,
          error:
            "Courier assignment is missing. Review the historical delivery records before recording cash collection",
        };
      if (next === OrderStatuses.Shipped || options.riderId) {
        if (
          order.riderId &&
          !(await tx.rider.findFirst({
            where: {
              id: order.riderId,
              active: true,
              OR: [{ userId: null }, { user: { active: true, roles: { has: Roles.Rider } } }],
            },
          }))
        )
          return { ok: false, error: "Delivery partner is inactive" };
        if (
          order.deliveryCompanyId &&
          !(await tx.deliveryCompany.findFirst({
            where: { id: order.deliveryCompanyId, active: true },
          }))
        )
          return { ok: false, error: "Delivery company is inactive" };
      }
      const now = new Date();
      const changed = await tx.order.updateMany({
        where: {
          id: orderId,
          status: order.status,
          riderId: order.riderId,
          deliveryCompanyId: order.deliveryCompanyId,
          walletPaidCents: order.walletPaidCents,
        },
        data: {
          status: next as OrderStatus,
          ...(next === OrderStatuses.Shipped ? { shippedAt: now } : {}),
          ...(next === OrderStatuses.Delivered
            ? {
                deliveredAt: now,
                ...(order.paymentMethod === PaymentMethods.COD && !order.paidAt
                  ? { paidAt: now }
                  : {}),
              }
            : {}),
        },
      });
      if (!changed.count) return { ok: false, error: "Order changed. Refresh and try again" };
      if (next === OrderStatuses.Delivered) await rewardDeliveredReferral(tx, orderId);
      if (next === OrderStatuses.Delivered && options.proof && options.riderId) {
        await tx.deliveryProof.create({
          data: { orderId, riderId: options.riderId, ...options.proof },
        });
        await recordOrderEvent(tx, {
          orderId,
          type: OrderEventTypes.DeliveryProofRecorded,
          actor: options.actor,
          message: `Handover recorded for ${options.proof.receivedBy} (${options.proof.relationship})`,
        });
      }
      await recordOrderEvent(tx, {
        orderId,
        type: next as OrderEventType,
        actor: options.actor,
        fromStatus: order.status,
        toStatus: next as OrderStatus,
        message:
          next === OrderStatuses.Cancelled
            ? "Order cancelled; reserved stock released"
            : `Order ${ORDER_STATUS_LABELS[next]?.toLowerCase() ?? next.toLowerCase()}`,
      });
      if (next === OrderStatuses.Delivered && cashDue > 0 && options.actor && order.currencyCode) {
        const courier = order.riderId
          ? await tx.rider.findUniqueOrThrow({
              where: { id: order.riderId },
              select: { name: true },
            })
          : order.deliveryCompanyId
            ? await tx.deliveryCompany.findUniqueOrThrow({
                where: { id: order.deliveryCompanyId },
                select: { name: true },
              })
            : null;
        if (!courier) throw new Error("Delivery partner is missing; refresh the order");
        await tx.codCollection.create({
          data: {
            orderId,
            amountCents: cashDue,
            currencyCode: order.currencyCode,
            collectedById: options.actor.id,
            collectedByName: options.actor.name,
            collectedByRole: options.actor.role,
            courierName: courier.name,
          },
        });
        await recordOrderEvent(tx, {
          orderId,
          type: OrderEventTypes.CodCollected,
          actor: options.actor,
          amountCents: cashDue,
          message: `Cash collected by ${courier.name}; awaiting store remittance`,
        });
      }
      if (next === OrderStatuses.Cancelled) {
        await tx.paymentAttempt.updateMany({
          where: { orderId, status: { not: PaymentAttemptStatuses.Succeeded } },
          data: { status: PaymentAttemptStatuses.Expired, gatewayUrl: null },
        });
        for (const item of [...order.items].sort((a, b) =>
          a.productId.localeCompare(b.productId),
        )) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
          if (order.warehouseId)
            // Mirror the release at the fulfilling warehouse so per-location
            // stock and the movement ledger stay in parity with sellable stock.
            await applyWarehouseStockDelta(tx, {
              warehouseId: order.warehouseId,
              productId: item.productId,
              delta: item.quantity,
              reason: "Order cancelled",
              reasonCode: "Return",
              referenceId: order.number,
              actorId: options.actor?.id ?? "system",
              actorName: options.actor?.name ?? null,
            });
        }
        if (order.walletPaidCents > 0) {
          const wallet = await creditWalletBalance(tx, order.userId, order.walletPaidCents);
          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              orderId,
              amountCents: order.walletPaidCents,
              balanceAfterCents: wallet.balanceCents,
              type: WalletTransactionTypes.REFUND,
              note: "Refund for cancelled order",
            },
          });
          await recordOrderEvent(tx, {
            orderId,
            type: OrderEventTypes.WalletRefunded,
            actor: options.actor,
            amountCents: order.walletPaidCents,
            message: "Original wallet tender refunded",
          });
        }
        // Retain walletPaidCents as the original tender; the refund ledger records its reversal.
      }
      return { ok: true, number: order.number };
    })
    .catch((error: unknown): Result => {
      if (error instanceof Error && error.message === "WALLET_BALANCE_LIMIT")
        return {
          ok: false,
          error:
            "Cancellation was not applied because the refund would exceed the supported wallet balance. Contact finance to resolve the balance first",
        };
      throw error;
    });
}

export async function assignOrderDelivery(
  orderId: string,
  value: string,
  actor?: OrderActor,
): Promise<Result> {
  return db.$transaction(async (tx): Promise<Result> => {
    await lockAccountStatus(tx);
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) return { ok: false, error: "Order not found" };
    if (!canAssignDelivery(order.status))
      return { ok: false, error: "Delivery assignment is locked after dispatch or cancellation" };
    let riderId: string | null = null;
    let deliveryCompanyId: string | null = null;
    if (value.startsWith("rider:")) {
      riderId = value.slice(6);
      if (
        !(await tx.rider.findFirst({
          where: {
            id: riderId,
            active: true,
            OR: [{ userId: null }, { user: { active: true, roles: { has: Roles.Rider } } }],
          },
        }))
      )
        return { ok: false, error: "Select an active delivery partner" };
    } else if (value.startsWith("company:")) {
      deliveryCompanyId = value.slice(8);
      if (!(await tx.deliveryCompany.findFirst({ where: { id: deliveryCompanyId, active: true } })))
        return { ok: false, error: "Select an active delivery company" };
    } else if (value !== "") return { ok: false, error: "Invalid assignment" };
    if (riderId === order.riderId && deliveryCompanyId === order.deliveryCompanyId)
      return { ok: true, number: order.number };
    const changed = await tx.order.updateMany({
      where: {
        id: orderId,
        status: order.status,
        riderId: order.riderId,
        deliveryCompanyId: order.deliveryCompanyId,
      },
      data: { riderId, deliveryCompanyId },
    });
    if (!changed.count) return { ok: false, error: "Order changed. Refresh and try again" };
    const courier = riderId
      ? await tx.rider.findUniqueOrThrow({ where: { id: riderId }, select: { name: true } })
      : deliveryCompanyId
        ? await tx.deliveryCompany.findUniqueOrThrow({
            where: { id: deliveryCompanyId },
            select: { name: true },
          })
        : null;
    await recordOrderEvent(tx, {
      orderId,
      type: OrderEventTypes.DeliveryAssigned,
      actor,
      message: courier ? `Delivery assigned to ${courier.name}` : "Delivery assignment cleared",
    });
    return { ok: true, number: order.number };
  });
}
