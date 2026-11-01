import { OrderStatuses, PaymentMethods } from "@backend/lib/enums.mjs";
import type { Prisma } from "@backend/generated/prisma/client";
import { db } from "./db";

export function adminOrderQueues(now = new Date()) {
  const ready: Prisma.OrderWhereInput = {
    OR: [
      { status: { in: [OrderStatuses.Paid, OrderStatuses.Packed] } },
      { status: OrderStatuses.Pending, paymentMethod: PaymentMethods.COD },
    ],
  };
  return {
    dispatch: { label: "Ready for dispatch", where: ready },
    preparing: {
      label: "Orders being prepared",
      where: {
        status: { in: [OrderStatuses.Processing, OrderStatuses.Confirmed, OrderStatuses.Packing] },
      },
    },
    unassigned: {
      label: "Ready orders without a courier",
      where: { ...ready, riderId: null, deliveryCompanyId: null },
    },
    payment: {
      label: "Awaiting online payment",
      where: { status: OrderStatuses.Pending, paymentMethod: PaymentMethods.GATEWAY, paidAt: null },
    },
    overdue: {
      label: "In transit for over 48 hours",
      where: {
        status: OrderStatuses.Shipped,
        shippedAt: { lt: new Date(now.getTime() - 48 * 3600000) },
      },
    },
    "cod-review": {
      label: "Delivered COD without a collection record",
      where: {
        status: OrderStatuses.Delivered,
        paymentMethod: PaymentMethods.COD,
        totalCents: { gt: db.order.fields.walletPaidCents },
        codCollection: { is: null },
      },
    },
    currency: { label: "Orders with unrecorded currency", where: { currencyCode: null } },
  } satisfies Record<string, { label: string; where: Prisma.OrderWhereInput }>;
}
