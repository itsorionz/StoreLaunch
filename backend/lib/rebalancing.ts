import "server-only";
import { db } from "./db";

const DAY = 86400000;
/** Look-back window for sales velocity. */
export const VELOCITY_WINDOW_DAYS = 30;
/** Days of forward cover a warehouse should hold for its own velocity. */
export const COVER_DAYS = 7;

export type RebalancingSuggestion = {
  productId: string;
  productName: string;
  sku: string | null;
  from: { warehouseId: string; warehouseName: string; excessQty: number };
  to: { warehouseId: string; warehouseName: string; deficitQty: number };
  qty: number;
  /** Units/day sold at the destination over the velocity window. */
  velocityPerDay: number;
};

/**
 * Velocity-based transfer suggestions (§3.3).
 *
 * For every product stocked in at least two active warehouses:
 * - daily velocity per warehouse = sale units in the window / window days
 * - a warehouse's own target stock is max(reorder threshold, velocity × COVER_DAYS)
 * - warehouses below target are deficit; above target are surplus
 * - suggestions move the smallest quantity that closes a deficit, taken from
 *   the surplus warehouse with the most spare cover, so high-demand
 *   locations restock from slow movers instead of ordering new stock.
 *
 * Reorder threshold = StockLevel.minStock when set, else Product.reorderPoint
 * (per-warehouse override with global fallback).
 */
export async function suggestRebalancingTransfers(
  now = new Date(),
): Promise<RebalancingSuggestion[]> {
  const windowStart = new Date(now.getTime() - VELOCITY_WINDOW_DAYS * DAY);

  const [warehouses, levels, saleMovements] = await Promise.all([
    db.warehouse.findMany({
      where: { active: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    db.stockLevel.findMany({
      where: { product: { active: true } },
      include: {
        product: { select: { id: true, name: true, sku: true, reorderPoint: true } },
      },
    }),
    db.stockMovement.findMany({
      where: { reasonCode: "Sale", delta: { lt: 0 }, createdAt: { gte: windowStart } },
      select: { warehouseId: true, productId: true, delta: true },
    }),
  ]);
  if (warehouses.length < 2) return [];
  const nameById = new Map(warehouses.map((w) => [w.id, w.name]));
  const activeIds = new Set(nameById.keys());

  // Sale units per warehouse/product over the window.
  const soldBy = new Map<string, number>();
  for (const movement of saleMovements) {
    const key = `${movement.warehouseId}:${movement.productId}`;
    soldBy.set(key, (soldBy.get(key) ?? 0) + -movement.delta);
  }

  type WhLevel = {
    warehouseId: string;
    qty: number;
    threshold: number;
    velocityPerDay: number;
    target: number;
  };
  const byProduct = new Map<string, { name: string; sku: string | null; warehouses: WhLevel[] }>();
  for (const level of levels) {
    if (!activeIds.has(level.warehouseId)) continue;
    const entry = byProduct.get(level.product.id) ?? {
      name: level.product.name,
      sku: level.product.sku,
      warehouses: [],
    };
    const threshold = level.minStock > 0 ? level.minStock : level.product.reorderPoint;
    const velocityPerDay =
      (soldBy.get(`${level.warehouseId}:${level.product.id}`) ?? 0) / VELOCITY_WINDOW_DAYS;
    entry.warehouses.push({
      warehouseId: level.warehouseId,
      qty: level.qty,
      threshold,
      velocityPerDay,
      target: Math.max(threshold, Math.ceil(velocityPerDay * COVER_DAYS)),
    });
    byProduct.set(level.product.id, entry);
  }

  const suggestions: RebalancingSuggestion[] = [];
  for (const [productId, product] of byProduct) {
    if (product.warehouses.length < 2) continue;

    const deficits = product.warehouses
      .filter((w) => w.qty < w.target)
      .map((w) => ({ ...w, deficitQty: w.target - w.qty }))
      .sort((a, b) => b.deficitQty - a.deficitQty);
    const surplus = product.warehouses
      .filter((w) => w.qty > w.target)
      .map((w) => ({ ...w, excessQty: w.qty - w.target }))
      .sort((a, b) => b.excessQty - a.excessQty);
    if (!deficits.length || !surplus.length) continue;

    for (const deficit of deficits) {
      let remaining = deficit.deficitQty;
      for (const donor of surplus) {
        if (remaining <= 0) break;
        if (donor.excessQty <= 0) continue;
        const qty = Math.min(remaining, donor.excessQty);
        donor.excessQty -= qty;
        remaining -= qty;
        suggestions.push({
          productId,
          productName: product.name,
          sku: product.sku,
          from: {
            warehouseId: donor.warehouseId,
            warehouseName: nameById.get(donor.warehouseId) ?? donor.warehouseId,
            excessQty: qty,
          },
          to: {
            warehouseId: deficit.warehouseId,
            warehouseName: nameById.get(deficit.warehouseId) ?? deficit.warehouseId,
            deficitQty: qty,
          },
          qty,
          velocityPerDay: Math.round(deficit.velocityPerDay * 100) / 100,
        });
      }
    }
  }
  return suggestions;
}
