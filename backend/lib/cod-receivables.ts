import "server-only";
import { db } from "./db";
import { bdStartOfDay } from "./admin-dashboard-periods";

const DAY = 86400000;
/** Shipped this long ago without a delivery outcome counts as lost/stuck (§9.3). */
export const STUCK_SHIPMENT_DAYS = 14;

export const COD_AGING_BUCKETS = [
  { key: "current", label: "0–7 days", minDays: 0, maxDays: 7 },
  { key: "d8", label: "8–14 days", minDays: 8, maxDays: 14 },
  { key: "d15", label: "15–30 days", minDays: 15, maxDays: 30 },
  { key: "d31", label: "31+ days", minDays: 31, maxDays: Infinity },
] as const;

export type CodAgingBucketKey = (typeof COD_AGING_BUCKETS)[number]["key"];

// Whole days since the Bangladesh-time day the cash was collected. Aging is
// always per currency — nothing here sums across currencies.
export function codAgingDays(collectedAt: Date, now = new Date()): number {
  return Math.max(
    0,
    Math.floor((bdStartOfDay(now).getTime() - bdStartOfDay(collectedAt).getTime()) / DAY),
  );
}

export function codAgingBucket(days: number): CodAgingBucketKey {
  return COD_AGING_BUCKETS.find((bucket) => days <= bucket.maxDays)!.key;
}

export type CodReceivableRow = {
  carrierId: string | null;
  carrierName: string;
  currencyCode: string;
  outstandingCents: number;
  collectionCount: number;
  oldestCollectedAt: Date | null;
  buckets: Record<CodAgingBucketKey, { cents: number; count: number }>;
};

function emptyBuckets(): Record<CodAgingBucketKey, { cents: number; count: number }> {
  return Object.fromEntries(
    COD_AGING_BUCKETS.map((bucket) => [bucket.key, { cents: 0, count: 0 }]),
  ) as Record<CodAgingBucketKey, { cents: number; count: number }>;
}

/**
 * COD receivable tracking per carrier with aging (§9.2/§9.3): every unremitted
 * collection grouped by the order's delivery company (free-text courier
 * snapshot as fallback), bucketed by days held, per currency.
 */
export async function getCodReceivablesReport(now = new Date()): Promise<CodReceivableRow[]> {
  const collections = await db.codCollection.findMany({
    where: { remittedAt: null },
    include: {
      settlementLines: { select: { appliedCents: true } },
      order: {
        select: {
          deliveryCompanyId: true,
          deliveryCompany: { select: { name: true } },
        },
      },
    },
  });
  const rows = new Map<string, CodReceivableRow>();
  for (const collection of collections) {
    const settledCents = collection.settlementLines.reduce(
      (sum, line) => sum + line.appliedCents,
      0,
    );
    const outstandingCents = Math.max(0, collection.amountCents - settledCents);
    if (!outstandingCents) continue;
    const carrierId = collection.order.deliveryCompanyId;
    const carrierName = collection.order.deliveryCompany?.name ?? collection.courierName;
    const key = `${carrierId ?? "unassigned"}:${collection.currencyCode}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        carrierId,
        carrierName,
        currencyCode: collection.currencyCode,
        outstandingCents: 0,
        collectionCount: 0,
        oldestCollectedAt: null,
        buckets: emptyBuckets(),
      };
      rows.set(key, row);
    }
    row.outstandingCents += outstandingCents;
    row.collectionCount += 1;
    if (!row.oldestCollectedAt || collection.collectedAt < row.oldestCollectedAt)
      row.oldestCollectedAt = collection.collectedAt;
    const bucket = row.buckets[codAgingBucket(codAgingDays(collection.collectedAt, now))];
    bucket.cents += outstandingCents;
    bucket.count += 1;
  }
  return [...rows.values()].sort(
    (a, b) => b.outstandingCents - a.outstandingCents || a.carrierName.localeCompare(b.carrierName),
  );
}

export type CourierCodFlow = {
  currencyCode: string;
  collectedCents: number;
  remittedCents: number;
  outstandingCents: number;
};

export type CourierReconciliationRow = {
  carrierId: string;
  carrierName: string;
  active: boolean;
  shippedCount: number;
  inTransitCount: number;
  deliveredCount: number;
  returningCount: number;
  cancelledCount: number;
  lostCount: number;
  deliveryRatePercent: number;
  rtoRatePercent: number;
  cod: CourierCodFlow[];
};

/**
 * Courier reconciliation report (§9.3): shipped vs delivered vs returned vs
 * lost per registered carrier, plus the COD cash trail (collected, remitted,
 * outstanding) per currency. "Lost" = shipped more than STUCK_SHIPMENT_DAYS
 * ago with no delivery or return outcome yet.
 */
export async function getCourierReconciliationReport(
  now = new Date(),
): Promise<CourierReconciliationRow[]> {
  const [carriers, orders] = await Promise.all([
    db.deliveryCompany.findMany({ select: { id: true, name: true, active: true } }),
    db.order.findMany({
      where: { deliveryCompanyId: { not: null }, shippedAt: { not: null } },
      select: {
        deliveryCompanyId: true,
        status: true,
        shippedAt: true,
        codCollection: {
          select: {
            amountCents: true,
            currencyCode: true,
            remittedAt: true,
            settlementLines: { select: { appliedCents: true } },
          },
        },
      },
    }),
  ]);
  const stuckCutoff = bdStartOfDay(now).getTime() - STUCK_SHIPMENT_DAYS * DAY;
  const byCarrier = new Map<
    string,
    {
      shippedCount: number;
      inTransitCount: number;
      deliveredCount: number;
      returningCount: number;
      cancelledCount: number;
      lostCount: number;
      cod: Map<string, CourierCodFlow>;
    }
  >();
  for (const order of orders) {
    const carrierId = order.deliveryCompanyId!;
    let entry = byCarrier.get(carrierId);
    if (!entry) {
      entry = {
        shippedCount: 0,
        inTransitCount: 0,
        deliveredCount: 0,
        returningCount: 0,
        cancelledCount: 0,
        lostCount: 0,
        cod: new Map(),
      };
      byCarrier.set(carrierId, entry);
    }
    entry.shippedCount += 1;
    if (order.status === "Delivered") entry.deliveredCount += 1;
    else if (order.status === "ReturningToOrigin") entry.returningCount += 1;
    else if (order.status === "Cancelled") entry.cancelledCount += 1;
    else {
      entry.inTransitCount += 1;
      if (order.shippedAt!.getTime() < stuckCutoff) entry.lostCount += 1;
    }
    const collection = order.codCollection;
    if (collection) {
      let flow = entry.cod.get(collection.currencyCode);
      if (!flow) {
        flow = {
          currencyCode: collection.currencyCode,
          collectedCents: 0,
          remittedCents: 0,
          outstandingCents: 0,
        };
        entry.cod.set(collection.currencyCode, flow);
      }
      const appliedCents = collection.settlementLines.reduce(
        (sum, line) => sum + line.appliedCents,
        0,
      );
      flow.collectedCents += collection.amountCents;
      // Cash handed to the store: fully remitted collections count their whole
      // amount (legacy remits have no settlement lines); partial receipts count
      // what the batches actually applied. Collected = remitted + outstanding.
      if (collection.remittedAt) flow.remittedCents += collection.amountCents;
      else {
        flow.remittedCents += appliedCents;
        flow.outstandingCents += Math.max(0, collection.amountCents - appliedCents);
      }
    }
  }
  return carriers.map((carrier) => {
    const entry = byCarrier.get(carrier.id);
    const settledCount = entry
      ? entry.deliveredCount + entry.returningCount + entry.cancelledCount
      : 0;
    return {
      carrierId: carrier.id,
      carrierName: carrier.name,
      active: carrier.active,
      shippedCount: entry?.shippedCount ?? 0,
      inTransitCount: entry?.inTransitCount ?? 0,
      deliveredCount: entry?.deliveredCount ?? 0,
      returningCount: entry?.returningCount ?? 0,
      cancelledCount: entry?.cancelledCount ?? 0,
      lostCount: entry?.lostCount ?? 0,
      deliveryRatePercent:
        settledCount > 0 && entry ? (entry.deliveredCount / settledCount) * 100 : 0,
      rtoRatePercent: settledCount > 0 && entry ? (entry.returningCount / settledCount) * 100 : 0,
      cod: entry
        ? [...entry.cod.values()].sort((a, b) => b.outstandingCents - a.outstandingCents)
        : [],
    };
  });
}
