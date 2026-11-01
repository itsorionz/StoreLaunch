import Link from "next/link";
import { requireWarehousePage } from "@backend/lib/session";
import { db } from "@backend/lib/db";
import { bdStartOfDay } from "@backend/lib/admin-dashboard-periods";
import { getWarehouseParityReport } from "@backend/lib/warehouse-parity";
import { getLowStockAlerts } from "@backend/lib/low-stock";
import { LowStockAlerts } from "@frontend/components/warehouse/low-stock-alerts";

export const metadata = { title: "Warehouse" };

export default async function WarehouseHomePage() {
  const user = await requireWarehousePage();
  const start = bdStartOfDay();

  const [picking, packed, receiptsToday, lowStock, parity, alerts] = await Promise.all([
    db.pickList.count({ where: { status: "Picking" } }),
    db.pickList.count({ where: { status: "Picked" } }),
    db.receipt.count({ where: { receivedAt: { gte: start } } }),
    db.stockLevel.count({ where: { qty: { lte: 0 }, minStock: { gt: 0 } } }),
    getWarehouseParityReport(),
    getLowStockAlerts(),
  ]);

  const cards = [
    { label: "Pick queue", value: picking, href: "/warehouse/pick" },
    { label: "Pack queue", value: packed, href: "/warehouse/pack" },
    { label: "Receipts today", value: receiptsToday, href: "/warehouse/receiving" },
    { label: "Out of stock rows", value: lowStock, href: "/warehouse/stock" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Warehouse overview</h1>
        <p className="text-sm text-muted">Welcome back, {user.name ?? "keeper"}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-xl border border-border bg-surface p-5 transition-colors hover:border-primary/40"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{card.label}</p>
            <p className="mt-2 text-3xl font-black tracking-tight">{card.value}</p>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-bold">Low stock alerts</h2>
        <LowStockAlerts alerts={alerts.slice(0, 20)} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">Stock parity</h2>
          <Link
            href="/warehouse/stock"
            className="text-sm font-semibold text-accent hover:underline"
          >
            Stock screen
          </Link>
        </div>
        {parity.driftCount ? (
          <p className="mt-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
            {parity.driftCount} of {parity.totalProducts} tracked products drifted between sellable
            stock and warehouse totals. Run a stocktake to reconcile.
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {parity.totalProducts} tracked products in parity between sellable stock and warehouse
            totals.
          </p>
        )}
      </div>
    </div>
  );
}
