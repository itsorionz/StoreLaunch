import {
  AfterSalesKinds,
  AfterSalesStatuses,
  OrderEventTypes,
  OrderStatuses,
} from "@backend/lib/enums.mjs";
export const PRE_DISPATCH_STATUSES = [
  OrderStatuses.Pending,
  OrderStatuses.Paid,
  OrderStatuses.Processing,
  OrderStatuses.Confirmed,
  OrderStatuses.Packing,
  OrderStatuses.Packed,
] as const;
export const PREPARATION_STATUSES = [
  OrderStatuses.Processing,
  OrderStatuses.Confirmed,
  OrderStatuses.Packing,
  OrderStatuses.Packed,
] as const;
export const ACTIVE_ORDER_STATUSES = [...PRE_DISPATCH_STATUSES, OrderStatuses.Shipped] as const;
export const CUSTOMER_ORDER_EVENTS = [
  OrderEventTypes.Placed,
  OrderEventTypes.PaymentConfirmed,
  ...PREPARATION_STATUSES,
  OrderStatuses.Shipped,
  OrderEventTypes.DeliveryAttempted,
  OrderEventTypes.ReturnToOriginStarted,
  OrderEventTypes.ReturnToOriginReceived,
  OrderStatuses.Delivered,
  OrderStatuses.Cancelled,
  OrderEventTypes.ReturnRequested,
  OrderEventTypes.ReturnApproved,
  OrderEventTypes.ReturnRejected,
  OrderEventTypes.ReturnReceived,
  OrderEventTypes.ReturnInspected,
  OrderEventTypes.ReturnResolved,
] as const;
export const ORDER_STATUS_LABELS: Record<string, string> = {
  [OrderStatuses.Pending]: "Order placed",
  [OrderStatuses.Paid]: "Payment confirmed",
  [OrderStatuses.Processing]: "Processing",
  [OrderStatuses.Confirmed]: "Confirmed",
  [OrderStatuses.Packing]: "Packing",
  [OrderStatuses.Packed]: "Packed",
  [OrderStatuses.Shipped]: "Delivering",
  [OrderStatuses.ReturningToOrigin]: "Returning to store",
  [OrderStatuses.Delivered]: "Delivered",
  [OrderStatuses.Cancelled]: "Cancelled",
};
export const ACTIVE_AFTER_SALES_STATUSES: readonly string[] = [
  AfterSalesStatuses.Requested,
  AfterSalesStatuses.Approved,
  AfterSalesStatuses.Received,
  AfterSalesStatuses.Inspected,
];
export const AFTER_SALES_KIND_LABELS: Record<string, string> = {
  [AfterSalesKinds.Cancellation]: "Cancellation",
  [AfterSalesKinds.Return]: "Return",
  [AfterSalesKinds.Replacement]: "Replacement",
};
export const AFTER_SALES_STATUS_LABELS: Record<string, string> = {
  [AfterSalesStatuses.Requested]: "Awaiting review",
  [AfterSalesStatuses.Approved]: "Approved",
  [AfterSalesStatuses.Rejected]: "Declined",
  [AfterSalesStatuses.Received]: "Received at store",
  [AfterSalesStatuses.Inspected]: "Inspected",
  [AfterSalesStatuses.Resolved]: "Resolved",
};
export const AFTER_SALES_STEPS: Record<string, readonly string[]> = {
  [AfterSalesKinds.Cancellation]: ["Request submitted", "Store review", "Refund issued"],
  [AfterSalesKinds.Return]: [
    "Request submitted",
    "Store review",
    "Items received",
    "Refund issued",
  ],
  [AfterSalesKinds.Replacement]: [
    "Request submitted",
    "Store review",
    "Items received",
    "Replacement sent",
  ],
};
