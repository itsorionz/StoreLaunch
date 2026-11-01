import { InboxCategories, OrderEventTypes, Roles } from "@backend/lib/enums.mjs";
import "server-only";
import type { OrderEventType, OrderStatus, Prisma } from "@backend/generated/prisma/client";

export type OrderActor = {
  id: string;
  name: string;
  role:
    | typeof Roles.Customer
    | typeof Roles.Admin
    | typeof Roles.Rider
    | typeof Roles.Support
    | typeof Roles.Warehouse
    | typeof Roles.Sales;
};

export async function recordOrderEvent(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    type: OrderEventType;
    actor?: OrderActor;
    source?: "SYSTEM" | "PAYMENT_PROVIDER";
    fromStatus?: OrderStatus;
    toStatus?: OrderStatus;
    message: string;
    amountCents?: number;
    dedupeKey?: string;
  },
) {
  const { actor, source, ...event } = input;
  // INSERT ... ON CONFLICT DO NOTHING never updates an existing audit entry.
  await tx.orderEvent.createMany({
    data: {
      ...event,
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? (source === "PAYMENT_PROVIDER" ? "SSLCommerz" : "System"),
      actorRole: actor?.role ?? source ?? "SYSTEM",
    },
    skipDuplicates: true,
  });
  const updates: Partial<Record<OrderEventType, string>> = {
    [OrderEventTypes.Processing]: "We have received your order and are reviewing it.",
    [OrderEventTypes.Confirmed]: "Your order has been confirmed.",
    [OrderEventTypes.Packing]: "We are packing your order.",
    [OrderEventTypes.Packed]: "Your order is packed and ready for collection.",
    [OrderEventTypes.Placed]: "Your order has been placed.",
    [OrderEventTypes.PaymentConfirmed]: "Payment for your order is confirmed.",
    [OrderEventTypes.Shipped]: "Your order is on its way.",
    [OrderEventTypes.Delivered]: "Your order has been delivered.",
    [OrderEventTypes.DeliveryAttempted]:
      "The courier could not complete your delivery attempt. The store will review the next step.",
    [OrderEventTypes.ReturnToOriginStarted]:
      "The delivery could not be completed. Your parcel is being returned to the store.",
    [OrderEventTypes.ReturnToOriginReceived]:
      "The store received your returned parcel and is reconciling any eligible refund.",
    [OrderEventTypes.Cancelled]: "Your order has been cancelled.",
    [OrderEventTypes.WalletRefunded]:
      "The wallet payment for your cancelled order has been refunded.",
    [OrderEventTypes.ReturnRequested]: "Your after-sales request has been submitted.",
    [OrderEventTypes.ReturnApproved]: "Your after-sales request has been approved.",
    [OrderEventTypes.ReturnRejected]: "Your after-sales request has been declined.",
    [OrderEventTypes.ReturnReceived]:
      "The returned items have been received and are awaiting inspection.",
    [OrderEventTypes.ReturnInspected]: "Inspection of the returned items is complete.",
    [OrderEventTypes.ReturnResolved]: "Your after-sales request has been resolved.",
  };
  const body = updates[input.type];
  if (body) {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: input.orderId },
      select: { userId: true, number: true },
    });
    await tx.inboxMessage.createMany({
      data: {
        userId: order.userId,
        category: InboxCategories.NOTIFICATION,
        title: `Order ${order.number}`,
        body,
        href: `/account/orders/${order.number}`,
        sourceKey: `order:${input.orderId}:${input.type}`,
      },
      skipDuplicates: true,
    });
  }
}
