import "server-only";
import type { Prisma, StockTransferStatus } from "@backend/generated/prisma/client";

export type TransferActor = { id: string; name?: string | null };

/**
 * Inter-warehouse transfer state machine:
 *
 *   Pending ──dispatch──▶ InTransit ──receive──▶ Received
 *      │                     │
 *      └──cancel──▶ Cancelled ◀──cancel (source stock restored)
 *
 * Dispatch moves stock out of the source warehouse (StockLevel + Product.stock
 * stay in parity; the in-transit quantity lives on the StockTransfer row).
 * Receive lands it at the destination. Cancel restores already-dispatched
 * stock so nothing is stranded in transit.
 */
export const TRANSFER_STATUSES: Record<"open" | "closed", StockTransferStatus[]> = {
  open: ["Pending", "InTransit"],
  closed: ["Received", "Cancelled"],
};

export async function createTransferRequest(
  tx: Prisma.TransactionClient,
  input: {
    productId: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    qty: number;
    note?: string | null;
    actor: TransferActor;
  },
): Promise<string> {
  if (!Number.isInteger(input.qty) || input.qty < 1) throw new Error("INVALID_QTY");
  if (input.fromWarehouseId === input.toWarehouseId) throw new Error("SAME_WAREHOUSE");

  const [product, fromWarehouse, toWarehouse] = await Promise.all([
    tx.product.findUnique({ where: { id: input.productId }, select: { id: true } }),
    tx.warehouse.findUnique({ where: { id: input.fromWarehouseId }, select: { id: true } }),
    tx.warehouse.findUnique({ where: { id: input.toWarehouseId }, select: { id: true } }),
  ]);
  if (!product || !fromWarehouse || !toWarehouse) throw new Error("TRANSFER_ENTITY_MISSING");

  const source = await tx.stockLevel.findUnique({
    where: {
      warehouseId_productId: {
        warehouseId: input.fromWarehouseId,
        productId: input.productId,
      },
    },
    select: { qty: true },
  });
  // Availability is checked again at dispatch; stock may move in between.
  if ((source?.qty ?? 0) < input.qty) throw new Error("INSUFFICIENT_STOCK");

  const transfer = await tx.stockTransfer.create({
    data: {
      productId: input.productId,
      fromWarehouseId: input.fromWarehouseId,
      toWarehouseId: input.toWarehouseId,
      qty: input.qty,
      note: input.note?.trim() || null,
      requestedById: input.actor.id,
      requestedByName: input.actor.name ?? null,
    },
    select: { id: true },
  });
  return transfer.id;
}

/** Pending → InTransit: stock leaves the source warehouse. */
export async function dispatchTransfer(
  tx: Prisma.TransactionClient,
  transferId: string,
  actor: TransferActor,
): Promise<void> {
  const transfer = await tx.stockTransfer.findUnique({ where: { id: transferId } });
  if (!transfer) throw new Error("TRANSFER_NOT_FOUND");
  if (transfer.status !== "Pending") throw new Error("TRANSFER_NOT_PENDING");

  // Re-check availability under the transaction; a sale may have consumed
  // the stock since the request was created.
  const adjusted = await tx.stockLevel.updateMany({
    where: {
      warehouseId: transfer.fromWarehouseId,
      productId: transfer.productId,
      qty: { gte: transfer.qty },
    },
    data: { qty: { decrement: transfer.qty } },
  });
  if (!adjusted.count) throw new Error("INSUFFICIENT_STOCK");

  await tx.product.update({
    where: { id: transfer.productId },
    data: { stock: { decrement: transfer.qty } },
  });
  // The guarded decrement above already moved StockLevel; record the ledger
  // row directly so availability and ledger always agree.
  await tx.stockMovement.create({
    data: {
      warehouseId: transfer.fromWarehouseId,
      productId: transfer.productId,
      delta: -transfer.qty,
      reason: `Transfer out — ${transfer.id}`,
      reasonCode: "Transfer",
      referenceId: transfer.id,
      actorId: actor.id,
      actorName: actor.name ?? null,
    },
  });

  await tx.stockTransfer.update({
    where: { id: transferId },
    data: {
      status: "InTransit",
      dispatchedById: actor.id,
      dispatchedByName: actor.name ?? null,
      dispatchedAt: new Date(),
    },
  });
}

/** InTransit → Received: stock lands at the destination warehouse. */
export async function receiveTransfer(
  tx: Prisma.TransactionClient,
  transferId: string,
  actor: TransferActor,
): Promise<void> {
  const transfer = await tx.stockTransfer.findUnique({ where: { id: transferId } });
  if (!transfer) throw new Error("TRANSFER_NOT_FOUND");
  if (transfer.status !== "InTransit") throw new Error("TRANSFER_NOT_IN_TRANSIT");

  await tx.stockLevel.upsert({
    where: {
      warehouseId_productId: {
        warehouseId: transfer.toWarehouseId,
        productId: transfer.productId,
      },
    },
    create: {
      warehouseId: transfer.toWarehouseId,
      productId: transfer.productId,
      qty: transfer.qty,
    },
    update: { qty: { increment: transfer.qty } },
  });
  await tx.product.update({
    where: { id: transfer.productId },
    data: { stock: { increment: transfer.qty } },
  });
  await tx.stockMovement.create({
    data: {
      warehouseId: transfer.toWarehouseId,
      productId: transfer.productId,
      delta: transfer.qty,
      reason: `Transfer in — ${transfer.id}`,
      reasonCode: "Transfer",
      referenceId: transfer.id,
      actorId: actor.id,
      actorName: actor.name ?? null,
    },
  });

  await tx.stockTransfer.update({
    where: { id: transferId },
    data: {
      status: "Received",
      receivedById: actor.id,
      receivedByName: actor.name ?? null,
      receivedAt: new Date(),
    },
  });
}

/** Pending → Cancelled (nothing moved) or InTransit → Cancelled (stock returned). */
export async function cancelTransfer(
  tx: Prisma.TransactionClient,
  transferId: string,
  actor: TransferActor,
): Promise<void> {
  const transfer = await tx.stockTransfer.findUnique({ where: { id: transferId } });
  if (!transfer) throw new Error("TRANSFER_NOT_FOUND");
  if (transfer.status !== "Pending" && transfer.status !== "InTransit")
    throw new Error("TRANSFER_CLOSED");

  if (transfer.status === "InTransit") {
    // Return the dispatched stock to the source warehouse.
    await tx.stockLevel.upsert({
      where: {
        warehouseId_productId: {
          warehouseId: transfer.fromWarehouseId,
          productId: transfer.productId,
        },
      },
      create: {
        warehouseId: transfer.fromWarehouseId,
        productId: transfer.productId,
        qty: transfer.qty,
      },
      update: { qty: { increment: transfer.qty } },
    });
    await tx.product.update({
      where: { id: transfer.productId },
      data: { stock: { increment: transfer.qty } },
    });
    await tx.stockMovement.create({
      data: {
        warehouseId: transfer.fromWarehouseId,
        productId: transfer.productId,
        delta: transfer.qty,
        reason: `Transfer cancelled — returned to stock — ${transfer.id}`,
        reasonCode: "Transfer",
        referenceId: transfer.id,
        actorId: actor.id,
        actorName: actor.name ?? null,
      },
    });
  }

  await tx.stockTransfer.update({
    where: { id: transferId },
    data: { status: "Cancelled", cancelledAt: new Date() },
  });
}

export const TRANSFER_ERROR_MESSAGES: Record<string, string> = {
  INVALID_QTY: "Quantity must be a whole number of at least 1",
  SAME_WAREHOUSE: "Source and destination warehouses must differ",
  TRANSFER_ENTITY_MISSING: "Product or warehouse no longer exists",
  INSUFFICIENT_STOCK: "Insufficient stock in the source warehouse",
  TRANSFER_NOT_FOUND: "Transfer no longer exists",
  TRANSFER_NOT_PENDING: "Only pending transfers can be dispatched",
  TRANSFER_NOT_IN_TRANSIT: "Only in-transit transfers can be received",
  TRANSFER_CLOSED: "Only pending or in-transit transfers can be cancelled",
};
