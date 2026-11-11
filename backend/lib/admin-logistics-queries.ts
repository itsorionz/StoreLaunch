import "server-only";
import { db } from "./db";

/** /admin/delivery-hubs — delivery hubs with their warehouse name, default-first. */
export async function listDeliveryHubs() {
  return db.deliveryHub.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: { warehouse: { select: { name: true } } },
  });
}

/** /admin/delivery-hubs — orders since `dayStart` grouped by hub (capacity counts). */
export async function countOrdersPerDeliveryHubSince(dayStart: Date) {
  return db.order.groupBy({
    by: ["deliveryHubId"],
    where: { deliveryHubId: { not: null }, createdAt: { gte: dayStart } },
    _count: { _all: true },
  });
}

/** /admin/delivery-hubs, /admin/delivery-zones, /admin/warehouse/transfer — active warehouse options. */
export async function listActiveWarehouses() {
  return db.warehouse.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });
}

/** /admin/delivery-zones — delivery zones ordered by name. */
export async function listDeliveryZones() {
  return db.deliveryZone.findMany({
    orderBy: { name: "asc" },
  });
}

/** /admin/delivery-zones — hub picker options (id/name/code). */
export async function listDeliveryHubOptions() {
  return db.deliveryHub.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, code: true },
  });
}

/** /admin/riders — riders with order counts and linked-account status. */
export async function listRiders() {
  return db.rider.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { orders: true } },
      user: { select: { email: true, active: true } },
    },
  });
}

/** /admin/riders — delivery companies with order counts. */
export async function listDeliveryCompanies() {
  return db.deliveryCompany.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { orders: true } } },
  });
}

/** /admin/warehouse — warehouses with their stock-level rows. */
export async function listWarehousesWithStockLevels() {
  return db.warehouse.findMany({
    include: { stockLevels: true },
    orderBy: { name: "asc" },
  });
}

/** /admin/warehouse/[id] — one warehouse by id (null when it does not exist). */
export async function getWarehouseById(id: string) {
  return db.warehouse.findUnique({ where: { id } });
}

/** /admin/warehouse/[id] — stock levels at the warehouse, ordered by product name. */
export async function listWarehouseStockLevels(warehouseId: string) {
  return db.stockLevel.findMany({
    where: { warehouseId },
    include: { product: true },
    orderBy: { product: { name: "asc" } },
  });
}

/** /admin/warehouse/transfer — most recent transfers (transfer queue, latest 50). */
export async function listRecentStockTransfers() {
  return db.stockTransfer.findMany({
    orderBy: { requestedAt: "desc" },
    take: 50,
    include: {
      product: { select: { name: true, sku: true } },
      fromWarehouse: { select: { name: true } },
      toWarehouse: { select: { name: true } },
    },
  });
}
