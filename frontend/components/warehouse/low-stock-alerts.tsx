import Link from "next/link";
import type { LowStockAlert } from "@backend/lib/low-stock";

/**
 * Per-warehouse low-stock alerts table, shared by the warehouse portal
 * overview and the admin warehouse screen.
 */
export function LowStockAlerts({
  alerts,
  showWarehouse = true,
  canRebalance = false,
}: {
  alerts: LowStockAlert[];
  showWarehouse?: boolean;
  canRebalance?: boolean;
}) {
  if (!alerts.length) {
    return (
      <div className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
        All stocked products are above their reorder thresholds.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5 font-semibold">Product</th>
              {showWarehouse && <th className="px-4 py-2.5 font-semibold">Warehouse</th>}
              <th className="px-4 py-2.5 text-right font-semibold">On hand</th>
              <th className="px-4 py-2.5 text-right font-semibold">Reorder at</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <tr
                key={`${alert.warehouseId}:${alert.productId}`}
                className="border-b border-border/50 last:border-0"
              >
                <td className="px-4 py-2.5 font-semibold">
                  {alert.productName}
                  <span className="block font-mono text-xs text-muted">{alert.sku ?? "—"}</span>
                </td>
                {showWarehouse && (
                  <td className="px-4 py-2.5">
                    {alert.warehouseName}
                    <span className="block font-mono text-xs text-muted">
                      {alert.warehouseCode}
                    </span>
                  </td>
                )}
                <td
                  className={`px-4 py-2.5 text-right font-bold ${alert.severity === "Out" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}
                >
                  {alert.qty}
                </td>
                <td className="px-4 py-2.5 text-right text-muted">{alert.threshold}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      alert.severity === "Out"
                        ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                    }`}
                  >
                    {alert.severity === "Out" ? "Out of stock" : "Low"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canRebalance && (
        <div className="border-t border-border px-4 py-2 text-xs text-muted">
          <Link href="/admin/warehouse/rebalance" className="underline hover:text-foreground">
            Rebalancing suggestions
          </Link>{" "}
          may cover some of these from surplus warehouses before you order more.
        </div>
      )}
    </div>
  );
}
