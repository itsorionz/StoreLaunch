import "server-only";
import { db } from "./db";

export type LowStockAlert = {
  productId: string;
  productName: string;
  sku: string | null;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  qty: number;
  /** Reorder threshold in effect: StockLevel.minStock when set, else Product.reorderPoint. */
  threshold: number;
  /** "Out" = zeroed at this warehouse; "Low" = at or below threshold. */
  severity: "Out" | "Low";
};

/**
 * Per-warehouse low-stock alerts (§3.4 / §7.6).
 *
 * A warehouse is low on a product when its stock is at or below the reorder
 * threshold: the per-warehouse `StockLevel.minStock` when set, otherwise the
 * global `Product.reorderPoint`. Products with a zero threshold are never
 * flagged (no reorder policy configured). Pass `warehouseId` to scope the
 * alerts to one warehouse.
 */
export async function getLowStockAlerts(warehouseId?: string): Promise<LowStockAlert[]> {
  const levels = await db.stockLevel.findMany({
    where: {
      ...(warehouseId ? { warehouseId } : {}),
      product: { active: true },
    },
    include: {
      product: { select: { id: true, name: true, sku: true, reorderPoint: true, active: true } },
      warehouse: { select: { id: true, name: true, code: true } },
    },
  });

  const alerts: LowStockAlert[] = [];
  for (const level of levels) {
    const threshold = level.minStock > 0 ? level.minStock : level.product.reorderPoint;
    if (threshold <= 0 || level.qty > threshold) continue;
    alerts.push({
      productId: level.product.id,
      productName: level.product.name,
      sku: level.product.sku,
      warehouseId: level.warehouse.id,
      warehouseName: level.warehouse.name,
      warehouseCode: level.warehouse.code,
      qty: level.qty,
      threshold,
      severity: level.qty === 0 ? "Out" : "Low",
    });
  }
  // Worst first: zeroed rows, then the lowest coverage.
  return alerts.sort(
    (a, b) =>
      a.severity.localeCompare(b.severity) ||
      a.qty / a.threshold - b.qty / b.threshold ||
      a.productName.localeCompare(b.productName),
  );
}
