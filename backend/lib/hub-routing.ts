import "server-only";
import type { Prisma } from "@backend/generated/prisma/client";
import { bdStartOfDay } from "./admin-dashboard-periods";

export type HubAssignment = {
  deliveryHubId: string | null;
  /**
   * True when the zone pins a hub that is already at its daily capacity and
   * no alternative hub can take the parcel. Callers reject the placement so
   * the configured hub limit is actually enforced.
   */
  atCapacity: boolean;
};

type HubCandidate = {
  id: string;
  capacity: number | null;
  city: string | null;
  region: string | null;
  warehouseId: string | null;
};

/**
 * Picks the delivery hub (pickup point) an order is assigned to.
 *
 * Rules (in priority order):
 * 1. A hub pinned on the delivery zone wins; when it is full, active hubs of
 *    the effective warehouse act as alternatives.
 * 2. Without a pin, hubs matching the delivery city/region are candidates,
 *    followed by the zone-mapped warehouse's hubs and addressless hubs of
 *    the fulfilling warehouse (zone → warehouse → hub mapping).
 * 3. Hubs over their daily capacity (orders assigned today vs `capacity`) are
 *    skipped; a null capacity means unlimited.
 *
 * The assignment never pulls in a hub of an unrelated city on its own.
 */
export async function assignDeliveryHub(
  tx: Prisma.TransactionClient,
  input: {
    zoneId?: string | null;
    city?: string | null;
    region?: string | null;
    warehouseId?: string | null;
    now?: Date;
  },
): Promise<HubAssignment> {
  const zone = input.zoneId
    ? await tx.deliveryZone.findUnique({
        where: { id: input.zoneId },
        select: { deliveryHubId: true, warehouseId: true },
      })
    : null;
  const pinnedId = zone?.deliveryHubId ?? null;
  // Zone mapping wins; the fulfilling warehouse is the fallback pool.
  const zoneMappedWarehouseId = zone?.warehouseId ?? null;
  const effectiveWarehouseId = zoneMappedWarehouseId ?? input.warehouseId ?? null;

  const hubs = await tx.deliveryHub.findMany({
    where: { active: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true, capacity: true, city: true, region: true, warehouseId: true },
  });
  if (!hubs.length) return { deliveryHubId: null, atCapacity: false };

  const haystack = [input.city, input.region]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim().toLowerCase());
  const matchesAddress = (hub: HubCandidate) =>
    haystack.length > 0 &&
    ((hub.city ? haystack.includes(hub.city.toLowerCase()) : false) ||
      (hub.region ? haystack.includes(hub.region.toLowerCase()) : false));
  const sameWarehouse = (hub: HubCandidate, warehouseId: string | null) =>
    Boolean(warehouseId) && hub.warehouseId === warehouseId;
  const isAddressless = (hub: HubCandidate) => !hub.city && !hub.region;
  // Without a pin the zone → warehouse → hub mapping still applies, and
  // addressless hubs belong to the fulfilling warehouse's service area.
  // Hubs of other cities are never pulled in just because stock routed there.
  const mappingFallback = (hub: HubCandidate) =>
    (zoneMappedWarehouseId !== null && hub.warehouseId === zoneMappedWarehouseId) ||
    (isAddressless(hub) &&
      effectiveWarehouseId !== null &&
      hub.warehouseId === effectiveWarehouseId);

  const ordered: HubCandidate[] = pinnedId
    ? [
        ...hubs.filter((hub) => hub.id === pinnedId),
        ...hubs.filter((hub) => hub.id !== pinnedId && sameWarehouse(hub, effectiveWarehouseId)),
      ]
    : [
        ...hubs.filter((hub) => matchesAddress(hub)),
        ...hubs.filter((hub) => !matchesAddress(hub) && mappingFallback(hub)),
      ];
  if (!ordered.length) return { deliveryHubId: null, atCapacity: false };

  // Count today's assignments (Bangladesh day) so capacity is parcels/day.
  const dayStart = bdStartOfDay(input.now ?? new Date());
  const counts = await tx.order.groupBy({
    by: ["deliveryHubId"],
    where: {
      deliveryHubId: { in: ordered.map((hub) => hub.id) },
      createdAt: { gte: dayStart },
    },
    _count: { _all: true },
  });
  const usedToday = new Map(
    counts
      .filter((row) => row.deliveryHubId)
      .map((row) => [row.deliveryHubId as string, row._count._all]),
  );
  const withRoom = ordered.filter(
    (hub) => hub.capacity === null || (usedToday.get(hub.id) ?? 0) < hub.capacity,
  );
  if (withRoom.length) return { deliveryHubId: withRoom[0].id, atCapacity: false };

  return { deliveryHubId: null, atCapacity: Boolean(pinnedId) };
}
