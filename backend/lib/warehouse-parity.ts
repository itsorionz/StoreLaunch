import "server-only";
import { db } from "./db";

export interface StockParityResult {
  productId: string;
  sku: string | null;
  productName: string;
  productStock: number;
  warehouseQty: number;
  variance: number; // productStock - warehouseQty
  hasDrift: boolean;
}

export async function assertStockParity(warehouseId?: string): Promise<StockParityResult[]> {
  const stockLevels = await db.stockLevel.findMany({
    where: warehouseId ? { warehouseId } : {},
    include: { product: true },
  });

  // Group by productId
  type StockLevelWithProduct = (typeof stockLevels)[number];
  const byProduct = new Map<
    string,
    { product: StockLevelWithProduct["product"]; totalQty: number }
  >();
  for (const sl of stockLevels) {
    const existing = byProduct.get(sl.productId);
    if (existing) {
      existing.totalQty += sl.qty;
    } else {
      byProduct.set(sl.productId, { product: sl.product, totalQty: sl.qty });
    }
  }

  const results: StockParityResult[] = [];
  for (const [productId, data] of byProduct) {
    const productStock = data.product.stock;
    const warehouseQty = data.totalQty;
    const variance = productStock - warehouseQty;
    results.push({
      productId,
      sku: data.product.sku,
      productName: data.product.name,
      productStock,
      warehouseQty,
      variance,
      hasDrift: variance !== 0,
    });
  }

  return results;
}

export async function getWarehouseParityReport(warehouseId?: string) {
  const results = await assertStockParity(warehouseId);
  return {
    totalProducts: results.length,
    driftCount: results.filter((r) => r.hasDrift).length,
    items: results,
  };
}

export async function getDeadStock(warehouseId: string, daysNoMovement = 90) {
  const cutoff = new Date(Date.now() - daysNoMovement * 86400000);

  const stockLevels = await db.stockLevel.findMany({
    where: { warehouseId, qty: { gt: 0 } },
    include: { product: true },
  });

  const movements = await db.inventoryAdjustment.findMany({
    where: {
      warehouseId,
      createdAt: { gte: cutoff },
    },
    select: { productId: true },
  });

  const movedProductIds = new Set(movements.map((m) => m.productId));

  const deadStock = stockLevels.filter((sl) => !movedProductIds.has(sl.productId));
  const deadStockQty = deadStock.reduce((sum, sl) => sum + sl.qty, 0);
  const deadStockValueCents = deadStock.reduce(
    (sum, sl) => sum + sl.qty * (sl.product.costCents ?? 0),
    0,
  );

  return {
    count: deadStock.length,
    qty: deadStockQty,
    valueCents: deadStockValueCents,
    items: deadStock.map((sl) => ({
      productId: sl.productId,
      productName: sl.product.name,
      sku: sl.product.sku,
      qty: sl.qty,
      valueCents: sl.qty * (sl.product.costCents ?? 0),
      binCode: sl.binCode,
    })),
  };
}
