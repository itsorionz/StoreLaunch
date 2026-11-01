import "server-only";
import type { Prisma } from "@backend/generated/prisma/client";

export interface WarehouseRoutingResult {
  /** Chosen fulfillment warehouse, or null when no warehouse is configured. */
  warehouseId: string | null;
  /**
   * True when per-warehouse stock rows do not exist yet (pre-backfill data).
   * Placement keeps legacy global `Product.stock` behavior in that case.
   */
  legacyGlobalStock: boolean;
}

export interface RoutingLine {
  productId: string;
  quantity: number;
}

/**
 * Chooses the warehouse that fulfils every line of an order.
 *
 * Rules (in priority order):
 * 1. The warehouse must be active and hold enough per-warehouse stock for all lines.
 * 2. A warehouse pinned on the delivery zone wins when it can fulfil the order.
 * 3. Warehouses whose city/region match the delivery address win over others.
 * 4. The default warehouse wins ties.
 * 5. When no warehouse qualifies, the default warehouse is returned so the caller
 *    can fall back to the legacy global-stock guard.
 */
export async function routeOrderToWarehouse(
  tx: Prisma.TransactionClient,
  items: RoutingLine[],
  city?: string | null,
  region?: string | null,
  preferredWarehouseId?: string | null,
): Promise<WarehouseRoutingResult> {
  const warehouses = await tx.warehouse.findMany({
    where: { active: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true, isDefault: true, city: true, region: true },
  });
  const fallback = warehouses.find((w) => w.isDefault) ?? warehouses[0] ?? null;
  if (!warehouses.length || !items.length) {
    return { warehouseId: fallback?.id ?? null, legacyGlobalStock: true };
  }

  // Merge duplicate lines so availability is evaluated per product.
  const required = new Map<string, number>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) throw new Error("CART_CHANGED");
    required.set(item.productId, (required.get(item.productId) ?? 0) + item.quantity);
  }

  const levels = await tx.stockLevel.findMany({
    where: {
      warehouseId: { in: warehouses.map((w) => w.id) },
      productId: { in: [...required.keys()] },
    },
    select: { warehouseId: true, productId: true, qty: true },
  });
  if (!levels.length) {
    // Nothing is tracked per warehouse yet: keep legacy global-stock behavior.
    return { warehouseId: fallback?.id ?? null, legacyGlobalStock: true };
  }

  const qtyByWarehouse = new Map<string, Map<string, number>>();
  for (const level of levels) {
    let perProduct = qtyByWarehouse.get(level.warehouseId);
    if (!perProduct) qtyByWarehouse.set(level.warehouseId, (perProduct = new Map()));
    perProduct.set(level.productId, (perProduct.get(level.productId) ?? 0) + level.qty);
  }

  const haystack = [city, region]
    .filter(Boolean)
    .map((value) => value!.trim().toLowerCase())
    .filter(Boolean);
  const matchesAddress = (warehouse: { city: string | null; region: string | null }) =>
    haystack.length > 0 &&
    ((warehouse.city ? haystack.includes(warehouse.city.toLowerCase()) : false) ||
      (warehouse.region ? haystack.includes(warehouse.region.toLowerCase()) : false));

  // Zone-pinned warehouses rank above address matches, which rank above the rest.
  const score = (warehouse: { id: string; city: string | null; region: string | null }) =>
    warehouse.id === preferredWarehouseId ? 2 : matchesAddress(warehouse) ? 1 : 0;

  // Warehouses are already ordered default-first; a stable sort keeps that as the tie-break.
  const candidates = warehouses
    .filter((warehouse) => {
      const perProduct = qtyByWarehouse.get(warehouse.id);
      if (!perProduct) return false;
      for (const [productId, qty] of required) {
        if ((perProduct.get(productId) ?? 0) < qty) return false;
      }
      return true;
    })
    .sort((a, b) => score(b) - score(a));

  const chosen = candidates[0] ?? fallback;
  return { warehouseId: chosen?.id ?? null, legacyGlobalStock: false };
}
