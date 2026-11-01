import "server-only";
import { CourierApiError, orderToParcel } from "./courier-adapter";
import { resolveCourierAdapter } from "./courier-adapter-registry";
import { db } from "./db";
import { OrderStatuses } from "@backend/lib/enums.mjs";

/**
 * Automatic carrier selection at dispatch (§5.3).
 *
 * Selection layers, in order:
 * 1. Zone rule — a `Courier` zone with a pinned carrier always wins (the zone
 *    is the store's contract with that carrier; see the zone-misconfiguration
 *    guardrail in §12). Own-rider zones refuse courier selection outright.
 * 2. ETA — carriers whose live quote promises more days than the zone allows
 *    rank below carriers meeting the ETA.
 * 3. Cost — cheapest live API quote after the carrier's negotiated volume
 *    discount (§5.3); carriers without a quote rank last.
 * 4. Performance — fewer RTOs break ties, then higher first-attempt success.
 * 5. Name — final deterministic tie-break.
 */

export type CarrierCandidate = {
  companyId: string;
  name: string;
  /** Live quote in minor units; null when the carrier cannot quote (manual mode). */
  rateCents: number | null;
  /** ETA upper bound from the quote, in days; null when unknown. */
  etaDaysTo: number | null;
  /** True when a live API quote was retrieved. */
  quoted: boolean;
  /** True when the delivery zone pins this carrier. */
  pinned: boolean;
  /** Share of this carrier's finished deliveries that ended in RTO (0 when none). */
  rtoRate: number;
  /** Volume discount off the live quote, in basis points (0 = none). */
  discountBps?: number;
  /** Parcels shipped with this carrier in the trailing 30 days. */
  parcels30d?: number;
  /** Trailing-30-day parcel volume the discount requires to kick in. */
  volumeMinParcels?: number;
  /** Share of delivered orders needing at most one attempt (defaults to 1 — no recorded failures). */
  firstAttemptRate?: number;
};

export type CarrierSelection =
  | { ok: true; companyId: string; name: string; reason: string; rateCents: number | null }
  | { ok: false; error: string };

function meetsEta(candidate: CarrierCandidate, zoneEtaDaysTo: number | null): boolean {
  return (
    candidate.etaDaysTo == null || zoneEtaDaysTo == null || candidate.etaDaysTo <= zoneEtaDaysTo
  );
}

/**
 * The quote the store actually expects to pay: the live rate reduced by the
 * carrier's volume discount once its trailing-30-day parcel volume clears the
 * negotiated threshold. Pure — exercised directly by tests.
 */
export function effectiveRateCents(candidate: CarrierCandidate): number | null {
  if (candidate.rateCents === null) return null;
  const discountBps = candidate.discountBps ?? 0;
  if (discountBps <= 0 || (candidate.parcels30d ?? 0) < (candidate.volumeMinParcels ?? 0))
    return candidate.rateCents;
  return Math.round((candidate.rateCents * (10000 - discountBps)) / 10000);
}

/**
 * Ranks candidates per the §5.3 rules. Pure — exercised directly by tests and
 * reused by `selectCarrierForOrder`.
 */
export function rankCarriers(
  candidates: CarrierCandidate[],
  zoneEtaDaysTo: number | null = null,
): CarrierCandidate[] {
  const pinned = candidates.filter((candidate) => candidate.pinned);
  if (pinned.length) return pinned;
  const effectiveRate = (candidate: CarrierCandidate) =>
    effectiveRateCents(candidate) ?? Number.POSITIVE_INFINITY;
  return [...candidates].sort(
    (a, b) =>
      Number(meetsEta(b, zoneEtaDaysTo)) - Number(meetsEta(a, zoneEtaDaysTo)) ||
      effectiveRate(a) - effectiveRate(b) ||
      a.rtoRate - b.rtoRate ||
      (b.firstAttemptRate ?? 1) - (a.firstAttemptRate ?? 1) ||
      a.name.localeCompare(b.name),
  );
}

/** Explains why the winning candidate was chosen (recorded on the order event). */
export function selectionReason(winner: CarrierCandidate, zoneEtaDaysTo: number | null): string {
  if (winner.pinned) return "pinned on the delivery zone";
  if (!winner.quoted) return "no live quotes available; first active carrier";
  const cost = meetsEta(winner, zoneEtaDaysTo)
    ? "cheapest live quote meeting the zone ETA"
    : "cheapest live quote";
  return effectiveRateCents(winner) !== winner.rateCents ? `${cost} after volume discount` : cost;
}

/**
 * Chooses the carrier for `orderId` at dispatch time. Never writes — the
 * caller (shipment creation) persists the choice so this stays safe to retry.
 */
export async function selectCarrierForOrder(orderId: string): Promise<CarrierSelection> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      zone: {
        select: { mode: true, deliveryCompanyId: true, etaDaysTo: true, name: true },
      },
    },
  });
  if (!order) return { ok: false, error: "Order not found" };
  if (order.zone?.mode === "OwnRider")
    return {
      ok: false,
      error: "This zone runs on own riders — assign a rider instead of a courier",
    };

  // Zone contract: the pinned carrier wins without querying alternatives.
  const pinnedId = order.zone?.deliveryCompanyId ?? null;
  if (pinnedId) {
    const pinned = await db.deliveryCompany.findUnique({
      where: { id: pinnedId },
      select: { id: true, name: true, active: true },
    });
    if (pinned?.active)
      return {
        ok: true,
        companyId: pinned.id,
        name: pinned.name,
        reason: "pinned on the delivery zone",
        rateCents: null,
      };
  }

  const companies = await db.deliveryCompany.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      providerKey: true,
      apiBaseUrl: true,
      apiClientId: true,
      apiSecret: true,
      storeId: true,
      volumeDiscountBps: true,
      volumeMinParcels: true,
    },
  });
  if (!companies.length) return { ok: false, error: "No active delivery companies configured" };
  const companyIds = companies.map((company) => company.id);

  // RTO share per carrier from finished deliveries (performance tie-break).
  const stats = await db.order.groupBy({
    by: ["deliveryCompanyId", "status"],
    where: {
      deliveryCompanyId: { not: null },
      status: { in: [OrderStatuses.Delivered, OrderStatuses.ReturningToOrigin] },
    },
    _count: { _all: true },
  });
  const rtoByCompany = new Map<string, { delivered: number; rto: number }>();
  for (const row of stats) {
    if (!row.deliveryCompanyId) continue;
    const bucket = rtoByCompany.get(row.deliveryCompanyId) ?? { delivered: 0, rto: 0 };
    const count = row._count._all;
    if (row.status === OrderStatuses.Delivered) bucket.delivered += count;
    else bucket.rto += count;
    rtoByCompany.set(row.deliveryCompanyId, bucket);
  }

  // Trailing-30-day throughput per carrier — a volume discount only applies
  // once this month's parcel volume clears the negotiated threshold (§5.3).
  const volumeCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const volumeStats = await db.order.groupBy({
    by: ["deliveryCompanyId"],
    where: {
      deliveryCompanyId: { in: companyIds },
      shippedAt: { gte: volumeCutoff },
    },
    _count: { _all: true },
  });
  const volumeByCompany = new Map<string, number>();
  for (const row of volumeStats) {
    if (row.deliveryCompanyId) volumeByCompany.set(row.deliveryCompanyId, row._count._all);
  }

  // First-attempt success per carrier (§5.3): delivered orders recorded with
  // at most one delivery attempt — the delivery scorecard's definition.
  const deliveredOrders = await db.order.findMany({
    where: {
      status: OrderStatuses.Delivered,
      deliveryCompanyId: { in: companyIds },
    },
    select: {
      deliveryCompanyId: true,
      _count: { select: { deliveryAttempts: true } },
    },
  });
  const attemptsByCompany = new Map<string, { delivered: number; firstTry: number }>();
  for (const row of deliveredOrders) {
    if (!row.deliveryCompanyId) continue;
    const bucket = attemptsByCompany.get(row.deliveryCompanyId) ?? { delivered: 0, firstTry: 0 };
    bucket.delivered += 1;
    if (row._count.deliveryAttempts <= 1) bucket.firstTry += 1;
    attemptsByCompany.set(row.deliveryCompanyId, bucket);
  }

  const parcel = orderToParcel(order);
  const candidates = await Promise.all(
    companies.map(async (company): Promise<CarrierCandidate> => {
      const adapter = resolveCourierAdapter(company);
      let rateCents: number | null = null;
      let etaDaysTo: number | null = null;
      if (adapter.isApi) {
        try {
          const quote = await adapter.calculateRate(parcel);
          rateCents = quote.rateCents;
          etaDaysTo = quote.etaDaysTo ?? null;
        } catch (error) {
          // A quote failure only means "unknown cost" — never blocks dispatch.
          if (!(error instanceof CourierApiError)) throw error;
        }
      }
      const bucket = rtoByCompany.get(company.id);
      const finished = bucket ? bucket.delivered + bucket.rto : 0;
      const attempts = attemptsByCompany.get(company.id);
      return {
        companyId: company.id,
        name: company.name,
        rateCents,
        etaDaysTo,
        quoted: rateCents !== null,
        pinned: company.id === pinnedId,
        rtoRate: finished > 0 ? bucket!.rto / finished : 0,
        discountBps: company.volumeDiscountBps,
        parcels30d: volumeByCompany.get(company.id) ?? 0,
        volumeMinParcels: company.volumeMinParcels,
        firstAttemptRate:
          attempts && attempts.delivered > 0 ? attempts.firstTry / attempts.delivered : undefined,
      };
    }),
  );

  const [winner] = rankCarriers(candidates, order.zone?.etaDaysTo ?? null);
  if (!winner) return { ok: false, error: "No active delivery companies available" };
  return {
    ok: true,
    companyId: winner.companyId,
    name: winner.name,
    reason: selectionReason(winner, order.zone?.etaDaysTo ?? null),
    rateCents: effectiveRateCents(winner),
  };
}
