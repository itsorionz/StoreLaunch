import "server-only";
import { db } from "./db";
import { getCourierReconciliationReport } from "./cod-receivables";
import { OrderStatuses } from "./enums.mjs";

const DAY = 86400000;
const STOCK_DAYS = 90;

// §10 shrinkage: stock that left without earning a sale. Negative ledger
// movements outside the business flows — i.e. stocktake shortages and manual
// write-offs (theft, damage, expiry). Sale/Dispatch/Transfer/Return are
// accounted for elsewhere; Receiving/Restock are inflows by definition.
const SHRINKAGE_EXCLUDED_CODES = ["Sale", "Dispatch", "Transfer", "Return", "Receiving", "Restock"];

export async function getWarehouseCards(warehouseId: string, now = new Date()) {
  const nowMs = now.getTime();
  const cutoff = new Date(nowMs - STOCK_DAYS * DAY);

  const stockLevels = await db.stockLevel.findMany({
    where: { warehouseId },
    include: { product: true },
  });

  const stockValueAtCents = stockLevels.reduce((sum, sl) => {
    return sum + sl.qty * (sl.product.costCents ?? 0);
  }, 0);

  const movements = await db.inventoryAdjustment.findMany({
    where: {
      createdAt: { gte: cutoff },
    },
    select: { productId: true },
  });
  const movedProductIds = new Set(movements.map((m) => m.productId));

  const deadStockQty = stockLevels
    .filter((sl) => !movedProductIds.has(sl.productId) && sl.qty > 0)
    .reduce((sum, sl) => sum + sl.qty, 0);
  const deadStockValueCents = stockLevels
    .filter((sl) => !movedProductIds.has(sl.productId) && sl.qty > 0)
    .reduce((sum, sl) => sum + sl.qty * (sl.product.costCents ?? 0), 0);

  // Per-warehouse reorder threshold (§7.5): StockLevel.minStock when set,
  // else the global Product.reorderPoint. Zero = no reorder policy → never low.
  const lowStockCount = stockLevels.filter((sl) => {
    const threshold = sl.minStock > 0 ? sl.minStock : (sl.product.reorderPoint ?? 0);
    return threshold > 0 && sl.qty <= threshold;
  }).length;

  // §10 shrinkage: value (at cost) of unexplained stock losses in the window —
  // negative ledger movements that are not part of a business flow. Stocktake
  // shortages and manual write-offs (theft/damage/expiry) land here.
  const shrinkageMovements = await db.stockMovement.findMany({
    where: {
      warehouseId,
      createdAt: { gte: cutoff },
      delta: { lt: 0 },
      OR: [{ reasonCode: null }, { reasonCode: { notIn: SHRINKAGE_EXCLUDED_CODES } }],
    },
    select: { delta: true, product: { select: { costCents: true } } },
  });
  const shrinkageCents = shrinkageMovements.reduce(
    (sum, movement) => sum + -movement.delta * (movement.product.costCents ?? 0),
    0,
  );

  const receivingAdjustments = await db.inventoryAdjustment.findMany({
    where: {
      createdAt: { gte: cutoff },
    },
  });

  return {
    stockValueCents: stockValueAtCents,
    deadStockQty,
    deadStockValueCents,
    lowStockCount,
    shrinkageCents,
    receivingCount: receivingAdjustments.length,
  };
}

export async function getDeliveryScorecard() {
  const deliveries = await db.order.findMany({
    where: {
      status: "Delivered",
    },
    include: {
      zone: true,
      deliveryAttempts: true,
    },
  });

  const totalDeliveries = deliveries.length;
  const firstAttemptDeliveries = deliveries.filter((d) => {
    const attempts = d.deliveryAttempts?.length ?? 0;
    return attempts <= 1;
  }).length;

  const avgOrderToDeliveryDays =
    deliveries.length > 0
      ? deliveries.reduce((sum, d) => {
          const orderCreated = d.createdAt.getTime();
          const delivered = d.deliveredAt?.getTime() ?? orderCreated;
          return sum + (delivered - orderCreated);
        }, 0) /
        deliveries.length /
        (1000 * 60 * 60 * 24)
      : 0;

  // §10 RTO %: share of *finished* deliveries (delivered or returned to
  // origin) that ended in RTO — the same denominator carrier-selection ranks
  // on. A Delivered-only set can never contain an RTO, so this needs its own
  // query over both terminal statuses.
  const finished = await db.order.groupBy({
    by: ["status"],
    where: { status: { in: [OrderStatuses.Delivered, OrderStatuses.ReturningToOrigin] } },
    _count: { _all: true },
  });
  let deliveredCount = 0;
  let rtoCount = 0;
  for (const row of finished) {
    const count = row._count._all;
    if (row.status === OrderStatuses.Delivered) deliveredCount += count;
    else rtoCount += count;
  }
  const finishedCount = deliveredCount + rtoCount;
  const rtoPercent = finishedCount > 0 ? (rtoCount / finishedCount) * 100 : 0;

  const onTimeHandover = deliveries.filter((d) => d.shippedAt !== null).length;
  const onTimeHandoverPercent = totalDeliveries > 0 ? (onTimeHandover / totalDeliveries) * 100 : 0;

  // §10 cost/parcel: average of the carrier quotes persisted at dispatch
  // (Shipments without a quote — manual/pinned — are excluded, not zeroed).
  const costs = await db.shipment.findMany({
    where: { costCents: { not: null } },
    select: { costCents: true, deliveryCompanyId: true },
  });
  const costPerParcel = costs.length
    ? costs.reduce((sum, shipment) => sum + (shipment.costCents ?? 0), 0) / costs.length
    : 0;
  const costByCarrier = new Map<string, { total: number; count: number }>();
  for (const shipment of costs) {
    if (!shipment.deliveryCompanyId) continue;
    const bucket = costByCarrier.get(shipment.deliveryCompanyId) ?? { total: 0, count: 0 };
    bucket.total += shipment.costCents ?? 0;
    bucket.count += 1;
    costByCarrier.set(shipment.deliveryCompanyId, bucket);
  }

  const codReceivable = await db.order.aggregate({
    where: {
      paymentMethod: "COD",
      status: {
        in: ["Pending", "Paid", "Processing", "Confirmed", "Packing", "Packed", "Shipped"],
      },
    },
    _sum: { totalCents: true },
  });

  // Per-carrier reconciliation (§9.3): reuse the shared courier report so the
  // dashboard and /admin/reconciliation agree on shipped vs delivered vs lost.
  // RTO % uses the same finished-delivery denominator as the overall scorecard.
  const courierReport = await getCourierReconciliationReport();
  const deliveryByCarrier = courierReport.map((row) => {
    const carrierFinished = row.deliveredCount + row.returningCount;
    const carrierCost = costByCarrier.get(row.carrierId);
    return {
      name: row.carrierName,
      delivered: row.deliveredCount,
      returned: row.returningCount,
      lost: row.lostCount,
      deliveryRatePercent: row.deliveryRatePercent,
      rtoPercent: carrierFinished > 0 ? (row.returningCount / carrierFinished) * 100 : 0,
      costPerParcelCents:
        carrierCost && carrierCost.count ? carrierCost.total / carrierCost.count : null,
    };
  });

  return {
    totalDeliveries,
    firstAttemptDeliveryPercent:
      totalDeliveries > 0 ? (firstAttemptDeliveries / totalDeliveries) * 100 : 0,
    avgOrderToDeliveryDays,
    rtoPercent: rtoPercent,
    costPerParcel: Math.round(costPerParcel),
    onTimeHandoverPercent: onTimeHandoverPercent,
    codReceivableCents: codReceivable._sum.totalCents ?? 0,
    deliveryByCarrier,
  };
}

export async function getMarginKpis(currencyCode: string, now = new Date()) {
  const nowMs = now.getTime();
  const start = new Date(nowMs - STOCK_DAYS * DAY);

  const orders = await db.order.findMany({
    where: {
      status: "Delivered",
      // Store currency only — cents of different currencies must never be
      // summed together (matches the dashboard's gross-profit card).
      currencyCode,
      deliveredAt: { gte: start },
    },
    include: {
      items: { include: { product: { include: { category: true } } } },
    },
  });

  let grossProfitCents = 0;
  let totalRevenueCents = 0;

  const categoryMargins: Record<string, { name: string; revenue: number; cost: number }> = {};
  const skuMargins: Record<string, { name: string; revenue: number; cost: number }> = {};

  for (const order of orders) {
    for (const item of order.items) {
      const product = item.product;
      const revenue = item.priceCents * item.quantity;
      const cost = (product.costCents ?? 0) * item.quantity;
      grossProfitCents += revenue - cost;
      totalRevenueCents += revenue;

      const catKey = product.categoryId ?? "uncategorized";
      if (!categoryMargins[catKey]) {
        categoryMargins[catKey] = {
          name: product.category?.name ?? "Uncategorized",
          revenue: 0,
          cost: 0,
        };
      }
      categoryMargins[catKey].revenue += revenue;
      categoryMargins[catKey].cost += cost;

      const skuKey = product.sku ?? product.id;
      if (!skuMargins[skuKey]) {
        skuMargins[skuKey] = { name: product.name, revenue: 0, cost: 0 };
      }
      skuMargins[skuKey].revenue += revenue;
      skuMargins[skuKey].cost += cost;
    }
  }

  const marginPercent = totalRevenueCents > 0 ? (grossProfitCents / totalRevenueCents) * 100 : 0;

  const categoryMarginsList = Object.entries(categoryMargins)
    .map(([categoryId, m]) => ({
      categoryId,
      categoryName: m.name,
      revenue: m.revenue,
      cost: m.cost,
      profit: m.revenue - m.cost,
      marginPercent: m.revenue > 0 ? ((m.revenue - m.cost) / m.revenue) * 100 : 0,
    }))
    .sort((a, b) => b.profit - a.profit);

  const skuMarginsList = Object.entries(skuMargins)
    .map(([sku, m]) => ({
      sku,
      name: m.name,
      revenue: m.revenue,
      cost: m.cost,
      profit: m.revenue - m.cost,
      marginPercent: m.revenue > 0 ? ((m.revenue - m.cost) / m.revenue) * 100 : 0,
    }))
    .sort((a, b) => b.marginPercent - a.marginPercent);

  return {
    grossProfitCents,
    totalRevenueCents,
    marginPercent,
    categoryMargins: categoryMarginsList,
    topMarginSkus: skuMarginsList.slice(0, 10),
    worstMarginSkus: skuMarginsList.slice(-10).reverse(),
  };
}

export async function getReorderReport() {
  const stockLevels = await db.stockLevel.findMany({
    include: {
      product: true,
      warehouse: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ product: { name: "asc" } }],
  });

  // Per-warehouse reorder point: StockLevel.minStock when set, else the
  // global Product.reorderPoint fallback.
  const suggestions = stockLevels
    .map((sl) => {
      const reorderPoint = sl.minStock > 0 ? sl.minStock : (sl.product.reorderPoint ?? 0);
      const suggestedQty = Math.max(reorderPoint - sl.qty, 0);
      return {
        productId: sl.product.id,
        productName: sl.product.name,
        sku: sl.product.sku,
        warehouseId: sl.warehouse.id,
        warehouseName: sl.warehouse.name,
        warehouseCode: sl.warehouse.code,
        currentStock: sl.qty,
        reorderPoint,
        suggestedQty,
        binCode: sl.binCode,
      };
    })
    .filter((s) => s.reorderPoint > 0 && s.suggestedQty > 0);

  return suggestions;
}
