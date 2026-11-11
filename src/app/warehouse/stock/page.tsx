import Link from "next/link";
import { requireWarehousePage } from "@backend/lib/session";
import {
  listActiveWarehousesWithCode,
  listOpenStockTransfers,
  listStockLevels,
} from "@backend/lib/warehouse-queries";
import { ReceiveTransferButton } from "@frontend/components/warehouse/receive-transfer-button";

export const metadata = { title: "Stock" };

export default async function WarehouseStockPage({
  searchParams,
}: {
  searchParams: Promise<{ warehouse?: string }>;
}) {
  await requireWarehousePage();
  const { warehouse } = await searchParams;

  const warehouses = await listActiveWarehousesWithCode();
  const selected =
    warehouses.find((w) => w.id === warehouse) ??
    warehouses.find((w) => w.isDefault) ??
    warehouses[0];

  const levels = selected ? await listStockLevels(selected.id) : [];

  const valueCents = levels.reduce(
    (sum, level) => sum + level.qty * (level.product.costCents ?? 0),
    0,
  );

  // In-transit visibility: transfers headed here awaiting receipt, plus this
  // warehouse's own open outbound requests.
  const openTransfers = selected ? await listOpenStockTransfers(selected.id) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Stock</h1>
          <p className="text-sm text-muted">
            Per-warehouse levels
            {selected
              ? ` · ${levels.length} products · value ৳${(valueCents / 100).toLocaleString("en-BD")}`
              : ""}
          </p>
        </div>
        {warehouses.length > 1 && (
          <nav className="flex flex-wrap gap-2">
            {warehouses.map((w) => (
              <Link
                key={w.id}
                href={`/warehouse/stock?warehouse=${w.id}`}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  selected?.id === w.id
                    ? "bg-primary/15 text-primary"
                    : "border border-border text-muted hover:bg-surface-2"
                }`}
              >
                {w.name}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {!selected ? (
        <p className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          No active warehouse yet. An administrator can add one from the admin warehouse screen.
        </p>
      ) : (
        <div className="rounded-xl border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5 font-semibold">Product</th>
                  <th className="px-4 py-2.5 font-semibold">SKU / Barcode</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Here</th>
                  <th className="px-4 py-2.5 text-right font-semibold">All warehouses</th>
                  <th className="px-4 py-2.5 font-semibold">Bin</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Reorder at</th>
                </tr>
              </thead>
              <tbody>
                {levels.map((level) => {
                  const low = level.minStock > 0 && level.qty <= level.minStock;
                  return (
                    <tr key={level.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2.5 font-semibold">{level.product.name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">
                        {level.product.sku ?? "—"}
                        {level.product.barcode ? ` / ${level.product.barcode}` : ""}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-bold ${low ? "text-amber-600 dark:text-amber-400" : ""}`}
                      >
                        {level.qty}
                        {low ? " ⚠" : ""}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted">{level.product.stock}</td>
                      <td className="px-4 py-2.5">{level.binCode ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right text-muted">{level.minStock || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!levels.length && (
            <p className="px-4 py-10 text-center text-sm text-muted">
              No stock rows for this warehouse yet. Record a receipt or stocktake to start tracking.
            </p>
          )}
        </div>
      )}

      {!!openTransfers.length && (
        <div className="rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Open transfers</h2>
            <p className="text-xs text-muted">
              In-transit stock for this route. Receive an incoming transfer to add it to stock.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5 font-semibold">Product</th>
                  <th className="px-4 py-2.5 font-semibold">Route</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Qty</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {openTransfers.map((t) => {
                  const incoming = t.toWarehouseId === selected?.id;
                  return (
                    <tr key={t.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2.5 font-semibold">
                        {t.product.name}
                        <span className="block font-mono text-xs text-muted">
                          {t.product.sku ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {t.fromWarehouse.name} → {t.toWarehouse.name}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold">{t.qty}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded px-2 py-1 text-xs font-medium ${
                            t.status === "InTransit"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                          }`}
                        >
                          {t.status === "InTransit" ? "In transit" : "Awaiting dispatch"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {incoming && t.status === "InTransit" ? (
                          <ReceiveTransferButton id={t.id} />
                        ) : (
                          <span className="text-xs text-muted">
                            {incoming ? "Awaiting admin dispatch" : "Outbound"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
