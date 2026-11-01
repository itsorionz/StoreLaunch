"use server";

import { db } from "../lib/db";
import { requireOpsEditor } from "../lib/session";

export type StocktakeProductHit = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  qty: number;
  binCode: string | null;
};

/** Product search scoped to a warehouse's stock rows for stocktake entry. */
export async function searchStocktakeProduct(
  warehouseId: string,
  query: string,
): Promise<StocktakeProductHit[]> {
  await requireOpsEditor();
  const term = String(query || "")
    .trim()
    .slice(0, 200);
  if (!term || !warehouseId) return [];
  const levels = await db.stockLevel.findMany({
    where: {
      warehouseId,
      OR: [
        { product: { name: { contains: term, mode: "insensitive" } } },
        { product: { sku: { contains: term, mode: "insensitive" } } },
        { product: { barcode: { contains: term, mode: "insensitive" } } },
      ],
    },
    select: {
      qty: true,
      binCode: true,
      product: { select: { id: true, name: true, sku: true, barcode: true } },
    },
    take: 20,
  });
  return levels.map((level) => ({
    id: level.product.id,
    name: level.product.name,
    sku: level.product.sku,
    barcode: level.product.barcode,
    qty: level.qty,
    binCode: level.binCode,
  }));
}

export type TransferProductHit = {
  id: string;
  name: string;
  sku: string | null;
  qty: number;
};

/** Stock rows of one warehouse for the admin transfer form's product picker. */
export async function listWarehouseProducts(warehouseId: string): Promise<TransferProductHit[]> {
  await requireOpsEditor();
  if (!warehouseId) return [];
  const levels = await db.stockLevel.findMany({
    where: { warehouseId },
    orderBy: { product: { name: "asc" } },
    select: {
      qty: true,
      product: { select: { id: true, name: true, sku: true } },
    },
  });
  return levels.map((level) => ({
    id: level.product.id,
    name: level.product.name,
    sku: level.product.sku,
    qty: level.qty,
  }));
}
