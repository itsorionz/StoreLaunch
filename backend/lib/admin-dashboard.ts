import { OrderDatabaseStatuses } from "./enums.mjs";
import { OrderStatuses, PaymentMethods, Roles } from "@backend/lib/enums.mjs";
import "server-only";
import type { Prisma } from "@backend/generated/prisma/client";
import { db } from "./db";
import { adminDashboardPeriods } from "./admin-dashboard-periods";
import { adminOrderQueues } from "./admin-order-queues";

export async function getAdminDashboard(currencyCode: string, range?: string, now = new Date()) {
  const period = adminDashboardPeriods(range, now);
  const current = { gte: period.start, lte: now };
  const previous = { gte: period.previousStart, lt: period.start };
  const paidWhere: Prisma.OrderWhereInput = {
    status: { not: OrderStatuses.Cancelled },
    currencyCode,
  };
  const queueDefinitions = adminOrderQueues(now);
  const [
    orders,
    previousOrders,
    paid,
    previousPaid,
    delivered,
    customers,
    previousCustomers,
    statuses,
    lowStockCount,
    outOfStock,
    lowStock,
    recentOrders,
    topProducts,
    orderDays,
    paidDays,
    unremitted,
    expectedCod,
    legacyCurrency,
    otherPaidCurrencies,
    reviewCount,
    riderCount,
    queueCounts,
  ] = await Promise.all([
    db.order.count({ where: { createdAt: current } }),
    db.order.count({ where: { createdAt: previous } }),
    db.order.aggregate({
      where: { ...paidWhere, paidAt: current },
      _sum: { totalCents: true },
      _count: true,
    }),
    db.order.aggregate({
      where: { ...paidWhere, paidAt: previous },
      _sum: { totalCents: true },
      _count: true,
    }),
    db.order.count({ where: { status: OrderStatuses.Delivered, deliveredAt: current } }),
    db.user.count({ where: { roles: { has: Roles.Customer }, createdAt: current } }),
    db.user.count({ where: { roles: { has: Roles.Customer }, createdAt: previous } }),
    db.order.groupBy({ by: ["status"], where: { createdAt: current }, _count: true }),
    db.product.count({ where: { active: true, stock: { lte: 5 } } }),
    db.product.count({ where: { active: true, stock: 0 } }),
    db.product.findMany({
      where: { active: true, stock: { lte: 5 } },
      orderBy: [{ stock: "asc" }, { name: "asc" }],
      select: { id: true, name: true, stock: true },
      take: 6,
    }),
    db.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 7,
      select: {
        id: true,
        number: true,
        status: true,
        totalCents: true,
        currencyCode: true,
        currencySymbol: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
    db.$queryRaw<Array<{ productId: string; name: string; units: bigint; value: bigint }>>`
      SELECT i."productId", MAX(i.name) AS name, SUM(i.quantity)::bigint AS units, SUM(i."priceCents"::bigint * i.quantity)::bigint AS value
      FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId"
      WHERE o.status != ${OrderDatabaseStatuses.Cancelled}::"OrderStatus" AND o."currencyCode" = ${currencyCode}
        AND o."createdAt" >= ${period.start}::timestamp AND o."createdAt" <= ${now}::timestamp
      GROUP BY i."productId" ORDER BY units DESC, value DESC, i."productId" LIMIT 5`,
    db.$queryRaw<Array<{ day: string; count: bigint }>>`
      SELECT to_char("createdAt" + interval '6 hours', 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS count FROM "Order"
      WHERE "createdAt" >= ${period.start}::timestamp AND "createdAt" <= ${now}::timestamp GROUP BY day`,
    db.$queryRaw<Array<{ day: string; value: bigint }>>`
      SELECT to_char("paidAt" + interval '6 hours', 'YYYY-MM-DD') AS day, SUM("totalCents")::bigint AS value FROM "Order"
      WHERE status != ${OrderDatabaseStatuses.Cancelled}::"OrderStatus" AND "currencyCode" = ${currencyCode}
        AND "paidAt" >= ${period.start}::timestamp AND "paidAt" <= ${now}::timestamp GROUP BY day`,
    db.$queryRaw<Array<{ currencyCode: string; remainingCents: bigint; collectionCount: bigint }>>`
      SELECT c."currencyCode", SUM(c."amountCents" - COALESCE(s."appliedCents", 0))::bigint AS "remainingCents", COUNT(*)::bigint AS "collectionCount"
      FROM "CodCollection" c LEFT JOIN (SELECT "codCollectionId", SUM("appliedCents") AS "appliedCents" FROM "CodSettlementLine" GROUP BY "codCollectionId") s ON s."codCollectionId" = c.id
      WHERE c."remittedAt" IS NULL AND c."amountCents" > COALESCE(s."appliedCents", 0) GROUP BY c."currencyCode" ORDER BY c."currencyCode"`,
    db.order.aggregate({
      where: {
        paymentMethod: PaymentMethods.COD,
        status: {
          in: [
            OrderStatuses.Pending,
            OrderStatuses.Paid,
            OrderStatuses.Processing,
            OrderStatuses.Confirmed,
            OrderStatuses.Packing,
            OrderStatuses.Packed,
            OrderStatuses.Shipped,
          ],
        },
        currencyCode,
      },
      _sum: { totalCents: true, walletPaidCents: true },
    }),
    db.order.count({ where: { currencyCode: null } }),
    db.order.count({
      where: {
        status: { not: OrderStatuses.Cancelled },
        paidAt: current,
        currencyCode: { not: currencyCode },
      },
    }),
    db.review.count({ where: { status: OrderStatuses.Pending } }),
    db.rider.count({ where: { active: true } }),
    Promise.all(
      Object.entries(queueDefinitions).map(async ([key, definition]) => ({
        key,
        label: definition.label,
        count: await db.order.count({ where: definition.where }),
      })),
    ),
  ]);
  const dailyOrders = new Map(orderDays.map((row) => [row.day, Number(row.count)]));
  const dailyPaid = new Map(paidDays.map((row) => [row.day, Number(row.value)]));
  return {
    period,
    orders,
    previousOrders,
    paidValue: paid._sum.totalCents ?? 0,
    previousPaidValue: previousPaid._sum.totalCents ?? 0,
    paidCount: paid._count,
    averagePaidValue: paid._count ? Math.round((paid._sum.totalCents ?? 0) / paid._count) : 0,
    delivered,
    customers,
    previousCustomers,
    statuses,
    lowStockCount,
    outOfStock,
    lowStock,
    recentOrders,
    topProducts: topProducts.map((product) => ({
      ...product,
      units: Number(product.units),
      value: Number(product.value),
    })),
    days: period.dates.map((day) => ({
      ...day,
      orders: dailyOrders.get(day.key) ?? 0,
      paidValue: dailyPaid.get(day.key) ?? 0,
    })),
    unremitted: unremitted.map((row) => ({
      currencyCode: row.currencyCode,
      _sum: { amountCents: Number(row.remainingCents) },
      _count: Number(row.collectionCount),
    })),
    expectedCod: (expectedCod._sum.totalCents ?? 0) - (expectedCod._sum.walletPaidCents ?? 0),
    legacyCurrency,
    otherPaidCurrencies,
    reviewCount,
    riderCount,
    queues: queueCounts,
  };
}
