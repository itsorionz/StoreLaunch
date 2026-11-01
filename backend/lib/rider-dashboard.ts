import { OrderDatabaseStatuses, Roles } from "./enums.mjs";
import { OrderStatuses, PaymentMethods } from "@backend/lib/enums.mjs";
import "server-only";
import { db } from "./db";
import { riderPeriods } from "./rider-periods";

type DeliveryCounts = {
  today: bigint;
  week: bigint;
  month: bigint;
  total: bigint;
  undated: bigint;
};
type CashRow = {
  currencyCode: string;
  today: bigint;
  month: bigint;
  total: bigint;
  held: bigint;
  handoverMonth: bigint;
  handoverToday: bigint;
  oldestHeld: Date | null;
  invalidDates: bigint;
};
type Trend = { bucket: string; key: string; count: bigint };
type CashTrend = { key: string; currencyCode: string; amount: bigint };

export async function getRiderDashboard(riderId: string, userId: string, now = new Date()) {
  const period = riderPeriods(now);
  // DateTime columns are stored as UTC timestamps without time zone. Cast bound parameters
  // directly to timestamp so the PostgreSQL session timezone cannot shift the reports.
  const [active, deliveryRows, statusCounts, cashRows, trendRows, cashTrend, attempts] =
    await Promise.all([
      db.order.findMany({
        where: {
          riderId,
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
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          number: true,
          status: true,
          recipientName: true,
          line1: true,
          city: true,
          paymentMethod: true,
          totalCents: true,
          currencyCode: true,
          currencySymbol: true,
          walletPaidCents: true,
          items: { select: { quantity: true } },
          deliveryAttempts: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { nextAttemptAt: true },
          },
        },
      }),
      db.$queryRaw<DeliveryCounts[]>`SELECT
      COUNT(*) FILTER (WHERE "deliveredAt" >= ${period.dayStart}::timestamp AND "deliveredAt" <= ${now}::timestamp) AS today,
      COUNT(*) FILTER (WHERE "deliveredAt" >= ${period.weekStart}::timestamp AND "deliveredAt" <= ${now}::timestamp) AS week,
      COUNT(*) FILTER (WHERE "deliveredAt" >= ${period.monthStart}::timestamp AND "deliveredAt" <= ${now}::timestamp) AS month,
      COUNT(*) FILTER (WHERE "deliveredAt" IS NULL OR "deliveredAt" <= ${now}::timestamp) AS total,
      COUNT(*) FILTER (WHERE "deliveredAt" IS NULL) AS undated
      FROM "Order" WHERE "riderId" = ${riderId} AND status = ${OrderDatabaseStatuses.Delivered}::"OrderStatus"`,
      db.order.groupBy({ by: ["status"], where: { riderId }, _count: { _all: true } }),
      db.$queryRaw<CashRow[]>`SELECT c."currencyCode",
      COALESCE(SUM(c."amountCents") FILTER (WHERE c."collectedAt" >= ${period.dayStart}::timestamp AND c."collectedAt" <= ${now}::timestamp), 0) AS today,
      COALESCE(SUM(c."amountCents") FILTER (WHERE c."collectedAt" >= ${period.monthStart}::timestamp AND c."collectedAt" <= ${now}::timestamp), 0) AS month,
      COALESCE(SUM(c."amountCents"), 0) AS total,
      COALESCE(SUM(c."amountCents" - COALESCE(s."appliedCents", 0)) FILTER (WHERE c."remittedAt" IS NULL), 0) AS held,
      COALESCE(SUM((SELECT COALESCE(SUM(l."receivedCents"), 0) FROM "CodSettlementLine" l JOIN "CodSettlement" s ON s.id = l."settlementId" WHERE l."codCollectionId" = c.id AND s."receivedAt" >= ${period.monthStart}::timestamp AND s."receivedAt" <= ${now}::timestamp) + CASE WHEN c."remittedAt" >= ${period.monthStart}::timestamp AND c."remittedAt" <= ${now}::timestamp AND NOT EXISTS (SELECT 1 FROM "CodSettlementLine" l WHERE l."codCollectionId" = c.id) THEN c."amountCents" ELSE 0 END), 0) AS "handoverMonth",
      COALESCE(SUM((SELECT COALESCE(SUM(l."receivedCents"), 0) FROM "CodSettlementLine" l JOIN "CodSettlement" s ON s.id = l."settlementId" WHERE l."codCollectionId" = c.id AND s."receivedAt" >= ${period.dayStart}::timestamp AND s."receivedAt" <= ${now}::timestamp) + CASE WHEN c."remittedAt" >= ${period.dayStart}::timestamp AND c."remittedAt" <= ${now}::timestamp AND NOT EXISTS (SELECT 1 FROM "CodSettlementLine" l WHERE l."codCollectionId" = c.id) THEN c."amountCents" ELSE 0 END), 0) AS "handoverToday",
      MIN(c."collectedAt") FILTER (WHERE c."remittedAt" IS NULL AND c."amountCents" > COALESCE(s."appliedCents", 0)) AS "oldestHeld",
      COUNT(*) FILTER (WHERE c."collectedAt" > ${now}::timestamp OR c."remittedAt" > ${now}::timestamp) AS "invalidDates"
      FROM "CodCollection" c LEFT JOIN (SELECT "codCollectionId", SUM("appliedCents") AS "appliedCents" FROM "CodSettlementLine" GROUP BY "codCollectionId") s ON s."codCollectionId" = c.id
      WHERE c."collectedById" = ${userId} AND c."collectedByRole" = ${Roles.Rider}
      GROUP BY c."currencyCode" ORDER BY c."currencyCode"`,
      db.$queryRaw<
        Trend[]
      >`SELECT 'day' AS bucket, to_char("deliveredAt" + interval '6 hours', 'YYYY-MM-DD') AS key, COUNT(*) AS count
      FROM "Order" WHERE "riderId" = ${riderId} AND status = ${OrderDatabaseStatuses.Delivered}::"OrderStatus" AND "deliveredAt" >= ${period.daysStart}::timestamp AND "deliveredAt" <= ${now}::timestamp GROUP BY key
      UNION ALL SELECT 'month' AS bucket, to_char("deliveredAt" + interval '6 hours', 'YYYY-MM') AS key, COUNT(*) AS count
      FROM "Order" WHERE "riderId" = ${riderId} AND status = ${OrderDatabaseStatuses.Delivered}::"OrderStatus" AND "deliveredAt" >= ${period.monthsStart}::timestamp AND "deliveredAt" <= ${now}::timestamp GROUP BY key`,
      db.$queryRaw<
        CashTrend[]
      >`SELECT to_char("collectedAt" + interval '6 hours', 'YYYY-MM') AS key, "currencyCode", SUM("amountCents") AS amount
      FROM "CodCollection" WHERE "collectedById" = ${userId} AND "collectedByRole" = ${Roles.Rider} AND "collectedAt" >= ${period.monthsStart}::timestamp AND "collectedAt" <= ${now}::timestamp
      GROUP BY key, "currencyCode" ORDER BY key, "currencyCode"`,
      db.deliveryAttempt.count({
        where: { riderId, createdAt: { gte: period.dayStart, lte: now } },
      }),
    ]);
  const counts = deliveryRows[0];
  const cash = cashRows.map((row) => ({
    currencyCode: row.currencyCode,
    today: Number(row.today),
    month: Number(row.month),
    total: Number(row.total),
    held: Number(row.held),
    handoverMonth: Number(row.handoverMonth),
    handoverToday: Number(row.handoverToday),
    oldestHeld: row.oldestHeld,
    invalidDates: Number(row.invalidDates),
  }));
  const remaining = new Map<string, number>();
  let unknownCashOrders = 0;
  for (const order of active) {
    const due =
      order.paymentMethod === PaymentMethods.COD
        ? Math.max(0, order.totalCents - order.walletPaidCents)
        : 0;
    if (!due) continue;
    if (!order.currencyCode) {
      unknownCashOrders++;
      continue;
    }
    remaining.set(order.currencyCode, (remaining.get(order.currencyCode) ?? 0) + due);
  }
  return {
    period,
    active,
    cash,
    todayAttempts: attempts,
    delivered: {
      today: Number(counts.today),
      week: Number(counts.week),
      month: Number(counts.month),
      total: Number(counts.total),
      undated: Number(counts.undated),
    },
    cancelled: statusCounts.find((row) => row.status === OrderStatuses.Cancelled)?._count._all ?? 0,
    outForDelivery: active.filter((order) => order.status === OrderStatuses.Shipped).length,
    awaitingPickup: active.filter(
      (order) =>
        order.status === OrderStatuses.Packed ||
        order.status === OrderStatuses.Paid ||
        (order.status === OrderStatuses.Pending && order.paymentMethod === PaymentMethods.COD),
    ).length,
    awaitingPayment: active.filter(
      (order) =>
        order.status === OrderStatuses.Pending && order.paymentMethod === PaymentMethods.GATEWAY,
    ).length,
    retriesDue: active.filter(
      (order) =>
        order.deliveryAttempts[0]?.nextAttemptAt && order.deliveryAttempts[0].nextAttemptAt <= now,
    ).length,
    remaining: [...remaining].map(([currencyCode, amount]) => ({ currencyCode, amount })),
    unknownCashOrders,
    daily: period.days.map((day) => ({
      ...day,
      count: Number(
        trendRows.find((row) => row.bucket === "day" && row.key === day.key)?.count ?? 0,
      ),
    })),
    monthly: period.months.map((month) => ({
      ...month,
      count: Number(
        trendRows.find((row) => row.bucket === "month" && row.key === month.key)?.count ?? 0,
      ),
      cash: cashTrend
        .filter((row) => row.key === month.key)
        .map((row) => ({ currencyCode: row.currencyCode, amount: Number(row.amount) })),
    })),
  };
}
