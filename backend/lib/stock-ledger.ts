import "server-only";
import type { Prisma } from "@backend/generated/prisma/client";

export interface StockDeltaInput {
  warehouseId: string;
  productId: string;
  /** Positive = stock in, negative = stock out. */
  delta: number;
  reason: string;
  reasonCode?: string | null;
  referenceId?: string | null;
  actorId: string;
  actorName?: string | null;
}

/**
 * Applies a per-warehouse stock delta and records it in the StockMovement
 * ledger within the caller's transaction.
 *
 * Callers must keep `Product.stock` in parity in the same transaction (the
 * global sellable total moves by the same delta), so
 * `Product.stock == Σ StockLevel.qty` always holds.
 */
export async function applyWarehouseStockDelta(
  tx: Prisma.TransactionClient,
  input: StockDeltaInput,
): Promise<void> {
  if (!Number.isInteger(input.delta) || input.delta === 0) return;
  await tx.stockLevel.upsert({
    where: {
      warehouseId_productId: {
        warehouseId: input.warehouseId,
        productId: input.productId,
      },
    },
    create: {
      warehouseId: input.warehouseId,
      productId: input.productId,
      qty: input.delta,
    },
    update: { qty: { increment: input.delta } },
  });
  await tx.stockMovement.create({
    data: {
      warehouseId: input.warehouseId,
      productId: input.productId,
      delta: input.delta,
      reason: input.reason,
      reasonCode: input.reasonCode ?? null,
      referenceId: input.referenceId ?? null,
      actorId: input.actorId,
      actorName: input.actorName ?? null,
    },
  });
}
