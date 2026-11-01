import "server-only";
import { db } from "./db";
import { OrderSources, OrderStatuses, Roles } from "@backend/lib/enums.mjs";

/**
 * Sales rep commission tracking (§6.1).
 *
 * The rate lives on the rep's account (`User.commissionBps`, basis points so
 * 5% = 500), while each POS order snapshots the commission it earned
 * (`Order.commissionCents`). Snapshotting keeps history immutable when a rate
 * changes later, and reports simply sum the snapshots.
 */

/** Commission on a sale in minor units, rounded to whole cents. */
export function commissionCentsFor(totalCents: number, commissionBps: number): number {
  if (!Number.isFinite(totalCents) || totalCents <= 0) return 0;
  const bps = Math.max(0, Math.round(commissionBps));
  return Math.round((totalCents * bps) / 10000);
}

/** Basis-point input guard shared by the admin editor. */
export function isValidCommissionBps(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 5000;
}

export type CommissionSummary = {
  orders: number;
  revenueCents: number;
  commissionCents: number;
};

const EMPTY_SUMMARY: CommissionSummary = { orders: 0, revenueCents: 0, commissionCents: 0 };

/** One rep's earned commission for orders created since `since` (cancelled excluded). */
export async function getRepCommission(
  salesRepId: string,
  since: Date,
): Promise<CommissionSummary> {
  const summary = await db.order.aggregate({
    where: {
      salesRepId,
      createdAt: { gte: since },
      status: { not: OrderStatuses.Cancelled },
    },
    _count: { _all: true },
    _sum: { totalCents: true, commissionCents: true },
  });
  return {
    orders: summary._count._all,
    revenueCents: summary._sum.totalCents ?? 0,
    commissionCents: summary._sum.commissionCents ?? 0,
  };
}

export type CommissionReportRow = CommissionSummary & {
  userId: string;
  name: string;
  commissionBps: number;
  /** Share of lifetime commission on this row (0 when the total is 0). */
  sharePercent: number;
};

/** Per-rep commission report across all non-cancelled sales-rep orders. */
export async function getCommissionReport(): Promise<{
  rows: CommissionReportRow[];
  totals: CommissionSummary;
  /** Reps on staff with no attributed orders yet. */
  idleReps: { userId: string; name: string; commissionBps: number }[];
}> {
  const reps = await db.user.findMany({
    where: { roles: { has: Roles.Sales } },
    select: { id: true, name: true, commissionBps: true },
    orderBy: { name: "asc" },
  });
  const grouped = await db.order.groupBy({
    by: ["salesRepId"],
    where: {
      source: OrderSources.SalesRep,
      salesRepId: { not: null },
      status: { not: OrderStatuses.Cancelled },
    },
    _count: { _all: true },
    _sum: { totalCents: true, commissionCents: true },
  });

  const byRep = new Map(
    grouped.map((row) => [
      row.salesRepId ?? "",
      {
        orders: row._count._all,
        revenueCents: row._sum.totalCents ?? 0,
        commissionCents: row._sum.commissionCents ?? 0,
      },
    ]),
  );

  const rows: CommissionReportRow[] = reps.map((rep) => ({
    userId: rep.id,
    name: rep.name,
    commissionBps: rep.commissionBps,
    ...summaryOrDefault(byRep.get(rep.id)),
    sharePercent: 0,
  }));

  // Orders attributed to accounts no longer flagged as sales reps still count.
  const repIds = new Set(reps.map((rep) => rep.id));
  const orphaned: CommissionReportRow[] = [];
  for (const [repId, summary] of byRep) {
    if (!repId || repIds.has(repId)) continue;
    const account = await db.user.findUnique({
      where: { id: repId },
      select: { name: true, commissionBps: true },
    });
    orphaned.push({
      userId: repId,
      name: account?.name ?? "Removed account",
      commissionBps: account?.commissionBps ?? 0,
      ...summary,
      sharePercent: 0,
    });
  }

  const allRows = [...rows, ...orphaned].sort((a, b) => b.commissionCents - a.commissionCents);
  const totals: CommissionSummary = allRows.reduce(
    (sum, row) => ({
      orders: sum.orders + row.orders,
      revenueCents: sum.revenueCents + row.revenueCents,
      commissionCents: sum.commissionCents + row.commissionCents,
    }),
    { orders: 0, revenueCents: 0, commissionCents: 0 },
  );
  for (const row of allRows) {
    row.sharePercent =
      totals.commissionCents > 0
        ? Math.round((row.commissionCents / totals.commissionCents) * 1000) / 10
        : 0;
  }

  return {
    rows: allRows,
    totals,
    idleReps: rows.filter((row) => row.orders === 0),
  };
}

function summaryOrDefault(summary?: CommissionSummary): CommissionSummary {
  return summary ?? EMPTY_SUMMARY;
}
