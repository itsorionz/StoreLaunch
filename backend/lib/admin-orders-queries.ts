import "server-only";
import { db } from "./db";
import { AfterSalesStatuses, OrderStatuses } from "./enums.mjs";
import { adminOrderQueues } from "./admin-order-queues";
import { adminDashboardPeriods } from "./admin-dashboard-periods";

export interface OrderTableRow {
  id: string;
  number: string;
  userName: string;
  userEmail: string;
  itemsQuantity: number;
  totalCents: number;
  currencyCode: string | null;
  currencySymbol: string | null;
  status: string;
  createdAt: string;
}

export interface OrdersListFilters {
  status?: string;
  cod?: string;
  queue?: string;
  range?: string;
}

const validStatuses = [
  OrderStatuses.Pending,
  OrderStatuses.Paid,
  OrderStatuses.Processing,
  OrderStatuses.Confirmed,
  OrderStatuses.Packing,
  OrderStatuses.Packed,
  OrderStatuses.Shipped,
  OrderStatuses.Delivered,
  OrderStatuses.Cancelled,
] as const;

/** /admin/orders - list page with status/cod/queue/range filters */
export async function getOrdersList(
  filters: OrdersListFilters = {},
): Promise<{ orders: OrderTableRow[]; total: number }> {
  const status = validStatuses.find((value) => value === filters.status);
  const unremitted = filters.cod === "unremitted";
  const queues = adminOrderQueues();
  const queue =
    filters.queue && Object.prototype.hasOwnProperty.call(queues, filters.queue)
      ? queues[filters.queue as keyof typeof queues]
      : undefined;
  const period = ["7", "30", "90"].includes(filters.range ?? "")
    ? adminDashboardPeriods(filters.range)
    : null;

  const orders = await db.order.findMany({
    where: {
      AND: [
        queue?.where ?? {},
        ...(status ? [{ status }] : []),
        ...(unremitted ? [{ codCollection: { is: { remittedAt: null } } }] : []),
        ...(period ? [{ createdAt: { gte: period.start, lte: period.end } }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true, email: true } },
      items: { select: { quantity: true } },
    },
    take: 100,
  });

  return {
    orders: orders.map((o) => ({
      id: o.id,
      number: o.number,
      userName: o.user.name,
      userEmail: o.user.email,
      itemsQuantity: o.items.reduce((s, i) => s + i.quantity, 0),
      totalCents: o.totalCents,
      currencyCode: o.currencyCode,
      currencySymbol: o.currencySymbol,
      status: o.status,
      createdAt: o.createdAt.toLocaleDateString(),
    })),
    total: orders.length,
  };
}

/** /admin/orders/[number] - full order detail payload for the admin page */
export async function getOrderDetail(number: string) {
  return db.order.findUnique({
    where: { number },
    include: {
      paymentAttempt: true,
      refunds: { orderBy: { createdAt: "desc" } },
      afterSalesRequests: {
        include: { refunds: true, items: { include: { orderItem: true } } },
        orderBy: { requestedAt: "desc" },
      },
      replacementForOrder: { select: { number: true } },
      deliveryProof: {
        select: {
          id: true,
          orderId: true,
          riderId: true,
          receivedBy: true,
          relationship: true,
          note: true,
          photoKey: true,
          photoMime: true,
          createdAt: true,
        },
      },
      deliveryAttempts: { orderBy: { createdAt: "desc" } },
      items: true,
      user: { select: { name: true, email: true } },
      codCollection: { include: { settlementLines: { select: { appliedCents: true } } } },
      events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
  });
}

/** /admin/orders/[number] - active riders assignable on the detail page */
export async function listActiveRiders() {
  return db.rider.findMany({
    where: { active: true, OR: [{ userId: null }, { user: { active: true } }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, phone: true },
  });
}

/** /admin/orders/[number] - active courier companies assignable on the detail page */
export async function listActiveDeliveryCompanies() {
  return db.deliveryCompany.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/** /admin/orders/[number] - rider still assigned to the order but not on the active roster */
export async function getRiderById(id: string) {
  return db.rider.findUnique({
    where: { id },
    select: { id: true, name: true, phone: true },
  });
}

/** /admin/orders/[number] - company still assigned to the order but not active */
export async function getDeliveryCompanyById(id: string) {
  return db.deliveryCompany.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
}

/** /admin/pack - pick lists ready for packing */
export async function listPackQueuePickLists() {
  return db.pickList.findMany({
    where: { status: "Picked" },
    include: {
      order: { select: { id: true, number: true } },
      lines: { include: { orderItem: true } },
    },
    orderBy: { pickedAt: "asc" },
  });
}

/** /admin/pick - pick lists ready for picking */
export async function listPickQueuePickLists() {
  return db.pickList.findMany({
    where: { status: "Picking" },
    include: {
      order: { select: { id: true, number: true } },
      lines: { include: { orderItem: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/** /admin/pack/[id] and /admin/pick/[id] - pick list with order, lines and products */
export async function getPickListDetail(id: string) {
  return db.pickList.findUnique({
    where: { id },
    include: {
      order: { select: { id: true, number: true } },
      lines: { include: { orderItem: { include: { product: true } } } },
    },
  });
}

/** /admin/dispatch - manifests for the given Bangladesh day key */
export async function listDispatchManifests(dayKey: string) {
  return db.dispatchManifest.findMany({
    where: { number: { endsWith: dayKey } },
    include: {
      deliveryCompany: { select: { id: true, name: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** /admin/dispatch - packed orders not yet handed to a shipment */
export async function listPackedOrdersReadyForDispatch() {
  return db.order.findMany({
    where: { status: "Packed", shipment: null },
    include: {
      zone: { select: { name: true, mode: true } },
      deliveryCompany: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
}

/** /admin/dispatch and /admin/shipments - active courier options */
export async function listActiveDeliveryCompaniesWithProviderKey() {
  return db.deliveryCompany.findMany({
    where: { active: true },
    select: { id: true, name: true, providerKey: true },
    orderBy: { name: "asc" },
  });
}

/** /admin/shipments - recent shipments with order and courier */
export async function listShipments() {
  return db.shipment.findMany({
    include: {
      order: {
        select: { number: true, recipientName: true, totalCents: true, currencySymbol: true },
      },
      deliveryCompany: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

/** /admin/shipments - orders that do not have a shipment yet */
export async function listOrdersWithoutShipment() {
  return db.order.findMany({
    where: { shipment: null, status: { notIn: ["Cancelled"] } },
    select: { id: true, number: true, recipientName: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/** /admin/shipments/[id]/label - shipment with its order items and courier */
export async function getShipmentForLabel(id: string) {
  return db.shipment.findUnique({
    where: { id },
    include: {
      order: { include: { items: { select: { quantity: true } } } },
      deliveryCompany: true,
    },
  });
}

/** /admin/payments - attempts awaiting payment or manual review (pagination total) */
export async function getPaymentRecoveryAttemptsCount() {
  const where = {
    OR: [{ order: { status: OrderStatuses.Pending } }, { requiresManualReview: true }],
  };
  return db.paymentAttempt.count({ where });
}

/** /admin/payments - one page of attempts awaiting payment or manual review */
export async function listPaymentRecoveryAttempts(page: number) {
  const where = {
    OR: [{ order: { status: OrderStatuses.Pending } }, { requiresManualReview: true }],
  };
  return db.paymentAttempt.findMany({
    where,
    include: {
      order: {
        select: {
          number: true,
          totalCents: true,
          walletPaidCents: true,
          currencyCode: true,
          currencySymbol: true,
          recipientName: true,
        },
      },
    },
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    skip: (page - 1) * 50,
    take: 50,
  });
}

/** /admin/reconciliation - unremitted COD collections (pagination total) */
export async function getUnremittedCodCollectionsCount() {
  return db.codCollection.count({ where: { remittedAt: null } });
}

/** /admin/reconciliation - one page of unremitted COD collections */
export async function listUnremittedCodCollections(page: number) {
  return db.codCollection.findMany({
    where: { remittedAt: null },
    orderBy: { collectedAt: "asc" },
    skip: (page - 1) * 100,
    take: 100,
    include: {
      settlementLines: { select: { appliedCents: true } },
      order: {
        select: {
          number: true,
          status: true,
          deliveryCompanyId: true,
          deliveryCompany: { select: { name: true } },
        },
      },
    },
  });
}

/** /admin/reconciliation - latest settlement batches for the ledger */
export async function listRecentCodSettlements() {
  return db.codSettlement.findMany({
    orderBy: { receivedAt: "desc" },
    take: 50,
    include: {
      lines: { include: { codCollection: { select: { order: { select: { number: true } } } } } },
    },
  });
}

/** /admin/returns - open after-sales requests (pagination total) */
export async function getOpenAfterSalesRequestsCount() {
  const where = {
    status: {
      in: [
        AfterSalesStatuses.Requested,
        AfterSalesStatuses.Approved,
        AfterSalesStatuses.Received,
        AfterSalesStatuses.Inspected,
      ],
    },
  };
  return db.afterSalesRequest.count({ where });
}

/** /admin/returns - orders currently returning to the store */
export async function listReturningToOriginOrders() {
  return db.order.findMany({
    where: { status: OrderStatuses.ReturningToOrigin },
    select: {
      id: true,
      number: true,
      recipientName: true,
      shippedAt: true,
      deliveryAttempts: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, reason: true },
      },
    },
    orderBy: { shippedAt: "asc" },
  });
}

/** /admin/returns - one page of open after-sales requests */
export async function listAfterSalesRequests(page: number) {
  const where = {
    status: {
      in: [
        AfterSalesStatuses.Requested,
        AfterSalesStatuses.Approved,
        AfterSalesStatuses.Received,
        AfterSalesStatuses.Inspected,
      ],
    },
  };
  return db.afterSalesRequest.findMany({
    where,
    include: {
      order: { select: { number: true } },
      user: { select: { name: true } },
      items: { include: { orderItem: { select: { name: true } } } },
    },
    orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
    skip: (page - 1) * 50,
    take: 50,
  });
}
