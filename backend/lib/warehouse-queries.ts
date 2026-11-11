import "server-only";
import { db } from "./db";

/** Default warehouse id used by the admin dashboard for warehouse-scoped cards. */
export async function getDefaultWarehouseId(): Promise<string | null> {
  const warehouse = await db.warehouse.findFirst({ where: { isDefault: true } });
  return warehouse?.id ?? null;
}

/** /warehouse home - "Pick queue" card: pick lists currently in Picking status */
export async function getPickQueueCount() {
  return db.pickList.count({ where: { status: "Picking" } });
}

/** /warehouse home - "Pack queue" card: picked pick lists awaiting packing */
export async function getPackQueueCount() {
  return db.pickList.count({ where: { status: "Picked" } });
}

/** /warehouse home - "Receipts today" card: receipts received since the given BD day start */
export async function getReceiptCountSince(start: Date) {
  return db.receipt.count({ where: { receivedAt: { gte: start } } });
}

/** /warehouse home - "Out of stock rows" card: stock levels at/below zero with a floor set */
export async function getOutOfStockLevelCount() {
  return db.stockLevel.count({ where: { qty: { lte: 0 }, minStock: { gt: 0 } } });
}

/** /warehouse/pack - picked pick lists awaiting packing confirmation */
export async function listWarehousePackQueue() {
  return db.pickList.findMany({
    where: { status: "Picked" },
    include: {
      order: { select: { number: true, city: true } },
      lines: { select: { id: true, confirmed: true } },
    },
    orderBy: { pickedAt: "asc" },
  });
}

/** /warehouse/pick - pick lists in Picking status awaiting the picker */
export async function listWarehousePickQueue() {
  return db.pickList.findMany({
    where: { status: "Picking" },
    include: {
      order: { select: { number: true, city: true, warehouse: { select: { name: true } } } },
      lines: { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/** /warehouse/pack/[id] - pick list with order and confirmed lines; the page guards status === "Picked" */
export async function getPackedPickList(id: string) {
  return db.pickList.findUnique({
    where: { id },
    include: {
      order: { select: { number: true, recipientName: true } },
      lines: { include: { orderItem: true }, orderBy: { id: "asc" } },
    },
  });
}

/** /warehouse/pick/[id] - pick list with order, lines and product codes; the page guards status === "Picking" */
export async function getPickingPickList(id: string) {
  return db.pickList.findUnique({
    where: { id },
    include: {
      order: { select: { number: true, city: true } },
      lines: {
        include: { orderItem: { include: { product: { select: { sku: true, barcode: true } } } } },
        orderBy: { id: "asc" },
      },
    },
  });
}

/** /warehouse/print - orders in preparation, oldest first, capped at 100 */
export async function listPrintableOrders() {
  return db.order.findMany({
    where: { status: { in: ["Packing", "Packed"] } },
    select: {
      number: true,
      status: true,
      recipientName: true,
      city: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
}

/** /warehouse/print/slip/[orderNumber] - order with items and warehouse for the packing slip */
export async function getPackingSlipOrder(orderNumber: string) {
  return db.order.findUnique({
    where: { number: orderNumber },
    include: {
      items: { include: { product: { select: { sku: true, barcode: true } } } },
      warehouse: { select: { name: true, code: true } },
    },
  });
}

/** /warehouse/receiving and /warehouse/stocktake - active warehouses, default first */
export async function listActiveWarehouses() {
  return db.warehouse.findMany({
    where: { active: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isDefault: true },
  });
}

/** /warehouse/stock - active warehouses (incl. code) for the selector tabs */
export async function listActiveWarehousesWithCode() {
  return db.warehouse.findMany({
    where: { active: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, code: true, isDefault: true },
  });
}

/** /warehouse/receiving - open purchase orders with remaining quantities */
export async function listOpenPurchaseOrders() {
  return db.purchaseOrder.findMany({
    where: { status: { in: ["Draft", "Sent", "Partial"] } },
    include: {
      supplier: { select: { name: true } },
      lines: {
        include: { product: { select: { name: true, sku: true } } },
        select: {
          productId: true,
          qtyOrdered: true,
          qtyReceived: true,
          product: { select: { name: true, sku: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
}

/** /warehouse/receiving - 20 most recent goods receipts */
export async function listRecentReceipts() {
  return db.receipt.findMany({
    orderBy: { receivedAt: "desc" },
    take: 20,
    include: {
      warehouse: { select: { name: true } },
      lines: { select: { qtyAccepted: true, qtyRejected: true } },
    },
  });
}

/** /warehouse/stock - stock levels for one warehouse */
export async function listStockLevels(warehouseId: string) {
  return db.stockLevel.findMany({
    where: { warehouseId },
    include: {
      product: {
        select: { name: true, sku: true, barcode: true, stock: true, costCents: true },
      },
    },
    orderBy: { product: { name: "asc" } },
  });
}

/** /warehouse/stock - in-transit transfers headed here, plus this warehouse's open outbound requests */
export async function listOpenStockTransfers(warehouseId: string) {
  return db.stockTransfer.findMany({
    where: {
      status: { in: ["Pending", "InTransit"] },
      OR: [{ toWarehouseId: warehouseId }, { fromWarehouseId: warehouseId }],
    },
    orderBy: { requestedAt: "asc" },
    include: {
      product: { select: { name: true, sku: true } },
      fromWarehouse: { select: { name: true } },
      toWarehouse: { select: { name: true } },
    },
  });
}

/** /warehouse/stocktake - 30 most recent stock movements for one warehouse */
export async function listRecentStockMovements(warehouseId: string) {
  return db.stockMovement.findMany({
    where: { warehouseId },
    include: { product: { select: { name: true, sku: true } } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
}
