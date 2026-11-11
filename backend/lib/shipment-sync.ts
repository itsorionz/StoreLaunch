import "server-only";
import { CourierApiError } from "./courier-adapter";
import { resolveCourierAdapter } from "./courier-adapter-registry";
import { db } from "./db";
import { recordOrderEvent } from "./order-events";
import { OrderEventTypes } from "@backend/lib/enums.mjs";
import type { ShipmentStatus } from "@backend/generated/prisma/client";
import { logger } from "./logger";

const log = logger.child({ scope: "shipment-sync" });

/**
 * Automated carrier status sync (§5.5).
 *
 * Polls API-mode shipments through the same adapter path as the manual sync
 * action. `lastSyncedAt` doubles as the polling lease: a shipment is only
 * selected again once it is at least `SHIPMENT_SYNC_STALE_MS` old, so the
 * scheduled job (or worker loop) can run at any cadence without double-fetching.
 * Failed syncs leave `lastSyncedAt` untouched so the next run retries them.
 */

/** Minimum age of `lastSyncedAt` before a shipment is polled again. */
export const SHIPMENT_SYNC_STALE_MS = 15 * 60_000;
/** Default batch size for one run. */
export const SHIPMENT_SYNC_BATCH = 50;

/** Statuses a carrier will never change again — excluded from polling. */
const TERMINAL_STATUSES: ShipmentStatus[] = ["Delivered", "Returned"];

export type ShipmentSyncOutcome = {
  shipmentId: string;
  orderId: string;
  ok: boolean;
  status?: ShipmentStatus;
  /** True when the carrier reported a new status in this run. */
  changed?: boolean;
  error?: string;
};

export type ShipmentSyncInput = {
  id: string;
  orderId: string;
  trackingNumber: string | null;
  status: ShipmentStatus;
  deliveryCompany: {
    name: string;
    providerKey: string | null;
    apiBaseUrl: string | null;
    apiClientId: string | null;
    apiSecret: string | null;
    storeId: string | null;
  } | null;
};

/**
 * Syncs one shipment from its carrier. Shared by the batch job and the manual
 * admin action so both paths persist identical history.
 */
export async function syncShipmentRecord(
  shipment: ShipmentSyncInput,
  now = new Date(),
): Promise<ShipmentSyncOutcome> {
  const base = { shipmentId: shipment.id, orderId: shipment.orderId };
  if (!shipment.deliveryCompany)
    return { ...base, ok: false, error: "No delivery company configured" };
  const adapter = resolveCourierAdapter(shipment.deliveryCompany);
  if (!adapter.isApi)
    return {
      ...base,
      ok: false,
      error: `${shipment.deliveryCompany.name} has no API credentials; update tracking manually`,
    };
  if (!shipment.trackingNumber)
    return { ...base, ok: false, error: "Shipment has no tracking number to sync" };

  let tracking;
  try {
    tracking = await adapter.getTracking(shipment.trackingNumber);
  } catch (error) {
    // API problems never crash the batch — the shipment retries next run.
    if (!(error instanceof CourierApiError)) {
      log.error("tracking fetch failed", {
        error,
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
      });
      throw error;
    }
    log.warn("tracking fetch rejected", {
      adapter: adapter.name,
      code: error.code,
      shipmentId: shipment.id,
      trackingNumber: shipment.trackingNumber,
    });
    return { ...base, ok: false, error: `${adapter.name} sync failed (${error.code})` };
  }

  const changed = tracking.status !== shipment.status;
  await db.shipment.update({
    where: { id: shipment.id },
    data: changed
      ? {
          status: tracking.status,
          lastSyncedAt: now,
          statusHistory: tracking.statusHistory.map((event) => ({
            ...event,
            timestamp: event.timestamp.toISOString(),
          })),
        }
      : { lastSyncedAt: now },
  });
  if (changed) {
    await recordOrderEvent(db, {
      orderId: shipment.orderId,
      type: OrderEventTypes.Shipped,
      message: `Tracking updated from ${adapter.name}: ${tracking.status}`,
    });
  }
  return { ...base, ok: true, status: tracking.status, changed };
}

/**
 * Polls one batch of stale, non-terminal API shipments. Returns an outcome per
 * attempted shipment (skipped rows are not included).
 */
export async function runShipmentSyncBatch(
  options: { limit?: number; now?: Date } = {},
): Promise<ShipmentSyncOutcome[]> {
  const now = options.now ?? new Date();
  const staleBefore = new Date(now.getTime() - SHIPMENT_SYNC_STALE_MS);
  const shipments = await db.shipment.findMany({
    where: {
      providerMode: "Api",
      trackingNumber: { not: null },
      status: { notIn: TERMINAL_STATUSES },
      deliveryCompany: { active: true },
      OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lte: staleBefore } }],
    },
    include: { deliveryCompany: true },
    orderBy: [{ lastSyncedAt: { sort: "asc", nulls: "first" } }],
    take: options.limit ?? SHIPMENT_SYNC_BATCH,
  });

  const outcomes: ShipmentSyncOutcome[] = [];
  for (const shipment of shipments) {
    outcomes.push(await syncShipmentRecord(shipment, now));
  }
  return outcomes;
}

/** Convenience filter for the shipments list UI: what the job would poll next. */
export function isSyncableShipment(shipment: {
  providerMode: string;
  trackingNumber: string | null;
  status: ShipmentStatus;
  deliveryCompanyId: string | null;
}): boolean {
  return (
    shipment.providerMode === "Api" &&
    Boolean(shipment.trackingNumber) &&
    Boolean(shipment.deliveryCompanyId) &&
    !TERMINAL_STATUSES.includes(shipment.status)
  );
}
