import { OrderStatuses, PaymentMethods } from "@backend/lib/enums.mjs";
import type { OrderStatus, PaymentMethod } from "@backend/generated/prisma/client";
import { PRE_DISPATCH_STATUSES, PREPARATION_STATUSES } from "./order-status";

export type OrderState = {
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  totalCents: number;
  walletPaidCents: number;
  riderId: string | null;
  deliveryCompanyId: string | null;
};

export function transitionError(
  order: OrderState,
  next: string,
  cashCollected = false,
): string | null {
  if (next === OrderStatuses.Cancelled) {
    if (!canAssignDelivery(order.status)) return "Only orders awaiting dispatch can be cancelled";
    if (
      order.status !== OrderStatuses.Pending &&
      order.paymentMethod === PaymentMethods.GATEWAY &&
      order.totalCents > order.walletPaidCents
    ) {
      return "This order has a gateway payment. Reconcile its external refund before cancellation; automatic gateway refunds are not available yet";
    }
    return null;
  }
  if ((PREPARATION_STATUSES as readonly string[]).includes(next)) {
    const expected: Record<string, readonly string[]> = {
      [OrderStatuses.Processing]: [OrderStatuses.Pending, OrderStatuses.Paid],
      [OrderStatuses.Confirmed]: [OrderStatuses.Processing],
      [OrderStatuses.Packing]: [OrderStatuses.Confirmed],
      [OrderStatuses.Packed]: [OrderStatuses.Packing],
    };
    if (!expected[next].includes(order.status))
      return "Complete the preceding preparation stage first";
    if (order.status === OrderStatuses.Pending && order.paymentMethod !== PaymentMethods.COD)
      return "Confirm online payment before processing this order";
    return null;
  }
  if (next === OrderStatuses.Shipped) {
    if (
      order.status !== OrderStatuses.Packed &&
      order.status !== OrderStatuses.Paid &&
      !(order.status === OrderStatuses.Pending && order.paymentMethod === PaymentMethods.COD)
    )
      return "Finish packing before dispatch; unpaid online orders cannot be dispatched";
    if (!order.riderId && !order.deliveryCompanyId)
      return "Assign a delivery partner before dispatch";
    return null;
  }
  if (next === OrderStatuses.Delivered) {
    if (order.status !== OrderStatuses.Shipped) return "Only dispatched orders can be delivered";
    if (
      order.paymentMethod === PaymentMethods.COD &&
      order.totalCents > order.walletPaidCents &&
      !cashCollected
    )
      return "Confirm that cash on delivery has been collected";
    return null;
  }
  return "Invalid order status";
}

export function canAssignDelivery(status: OrderStatus): boolean {
  return (PRE_DISPATCH_STATUSES as readonly string[]).includes(status);
}
