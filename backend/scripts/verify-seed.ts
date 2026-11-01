import { config } from "dotenv";
config({ quiet: true });

async function main() {
  const { db } = await import("../lib/db");
  const settings = await db.storeSettings.findFirst({
    select: { storeName: true, setupCompletedAt: true },
  });
  console.log("settings:", JSON.stringify(settings));
  console.log("users:", await db.user.count(), "| products:", await db.product.count());
  console.log(
    "warehouses:",
    await db.warehouse.count(),
    "| hubs:",
    await db.deliveryHub.count(),
    "| zones:",
    await db.deliveryZone.count(),
  );
  console.log(
    "stockLevels:",
    await db.stockLevel.count(),
    "| stockMovements:",
    await db.stockMovement.count(),
    "| transfers:",
    await db.stockTransfer.count(),
  );
  console.log(
    "shipments:",
    await db.shipment.count(),
    "| manifests:",
    await db.dispatchManifest.count(),
    "| manifestLines:",
    await db.dispatchManifestLine.count(),
  );
  console.log(
    "POs:",
    await db.purchaseOrder.count(),
    "| receipts:",
    await db.receipt.count(),
    "| suppliers:",
    await db.supplier.count(),
  );
  console.log(
    "orders w/ zone:",
    await db.order.count({ where: { zoneId: { not: null } } }),
    "| orders shippedAt:",
    await db.order.count({ where: { shippedAt: { not: null } } }),
  );

  // Invariant: Product.stock == Σ StockLevel.qty for every product.
  const levels = await db.stockLevel.groupBy({ by: ["productId"], _sum: { qty: true } });
  const qtyByProduct = new Map(levels.map((l) => [l.productId, l._sum.qty ?? 0]));
  const products = await db.product.findMany({
    select: { id: true, name: true, stock: true, costCents: true },
  });
  const mismatched = products.filter((p) => (qtyByProduct.get(p.id) ?? 0) !== p.stock);
  const withoutCost = products.filter((p) => p.costCents === null);
  console.log(
    "stock parity mismatches:",
    mismatched.length,
    mismatched.map((p) => p.name).slice(0, 5),
  );
  console.log("products missing costCents:", withoutCost.length);

  // Scorecard inputs on real data
  const scored = await db.shipment.findMany({
    where: { costCents: { not: null } },
    select: { costCents: true },
  });
  const avg = scored.length
    ? Math.round(scored.reduce((s, x) => s + (x.costCents ?? 0), 0) / scored.length)
    : 0;
  console.log("quoted shipments:", scored.length, "| avg cost/parcel cents:", avg);

  // End-to-end dashboard metrics (run with --conditions=react-server).
  try {
    const { getDeliveryScorecard } = await import("../lib/ops-intelligence");
    const score = await getDeliveryScorecard();
    console.log(
      "scorecard: deliveries",
      score.totalDeliveries,
      "| RTO%",
      Math.round(score.rtoPercent),
      "| cost/parcel",
      score.costPerParcel,
      "| carriers",
      score.deliveryByCarrier.length,
    );
    const { getCourierReconciliationReport } = await import("../lib/cod-receivables");
    const recon = await getCourierReconciliationReport();
    console.log("reconciliation rows:", JSON.stringify(recon));
    const wh = await db.warehouse.findFirst({ where: { isDefault: true } });
    if (wh) {
      const { getWarehouseCards } = await import("../lib/ops-intelligence");
      const cards = await getWarehouseCards(wh.id);
      console.log("warehouse cards:", JSON.stringify(cards));
    }
  } catch (error) {
    console.log("metric check skipped (server-only):", (error as Error).message.slice(0, 80));
  }
  await db.$disconnect();
}

main().catch((error) => {
  console.error("ERR", error);
  process.exit(1);
});
