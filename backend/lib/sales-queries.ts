import "server-only";
import { bdStartOfDay } from "./admin-dashboard-periods";
import { db } from "./db";
import { OrderSources } from "./enums.mjs";

/** /sales — today's counter-sale count and revenue (Bangladesh day boundary). */
export async function getSalesTodayStats(start: Date) {
  return db.order.aggregate({
    where: {
      source: OrderSources.SalesRep,
      createdAt: { gte: start },
      status: { not: "Cancelled" },
    },
    _count: { _all: true },
    _sum: { totalCents: true },
  });
}

/** /sales — the 10 most recent sales-rep orders. */
export async function listRecentSalesOrders() {
  return db.order.findMany({
    where: { source: OrderSources.SalesRep },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      number: true,
      status: true,
      totalCents: true,
      currencySymbol: true,
      recipientName: true,
      paymentMethod: true,
      paidAt: true,
      createdAt: true,
    },
  });
}

/** /sales/list — sales-counter orders, optionally limited to today. */
export async function listSalesOrders(active: string) {
  return db.order.findMany({
    where: {
      source: OrderSources.SalesRep,
      ...(active === "today" ? { createdAt: { gte: bdStartOfDay() } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      number: true,
      status: true,
      totalCents: true,
      currencySymbol: true,
      recipientName: true,
      phone: true,
      paymentMethod: true,
      paidAt: true,
      createdAt: true,
    },
  });
}

/** /sales/new — active delivery zones offered by the POS. */
export async function listActiveDeliveryZones() {
  return db.deliveryZone.findMany({
    where: { active: true },
    select: { id: true, name: true, rateCents: true },
    orderBy: { name: "asc" },
  });
}

/** /sales/orders/[number] — full sale detail payload (items, routing, history). */
export async function getSalesOrderDetail(number: string) {
  return db.order.findUnique({
    where: { number },
    include: {
      items: true,
      warehouse: { select: { name: true, code: true } },
      deliveryCompany: { select: { name: true } },
      rider: { select: { name: true, phone: true } },
      events: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          message: true,
          actorName: true,
          createdAt: true,
        },
      },
    },
  });
}

/** /sales/invoice/[orderNumber] — invoice order payload (items + customer contact). */
export async function getSalesInvoiceOrder(orderNumber: string) {
  return db.order.findUnique({
    where: { number: orderNumber },
    include: { items: true, user: { select: { name: true, phone: true } } },
  });
}
