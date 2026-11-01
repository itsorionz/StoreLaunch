import { requireWarehousePage } from "@backend/lib/session";
import { db } from "@backend/lib/db";
import { StocktakeForm } from "@frontend/components/warehouse/stocktake-form";

export const metadata = { title: "Stocktake" };

export default async function WarehouseStocktakePage({
  searchParams,
}: {
  searchParams: Promise<{ warehouse?: string }>;
}) {
  await requireWarehousePage();
  const { warehouse } = await searchParams;

  const warehouses = await db.warehouse.findMany({
    where: { active: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isDefault: true },
  });
  const selected =
    warehouses.find((w) => w.id === warehouse) ??
    warehouses.find((w) => w.isDefault) ??
    warehouses[0];

  const movements = selected
    ? await db.stockMovement.findMany({
        where: { warehouseId: selected.id },
        include: { product: { select: { name: true, sku: true } } },
        orderBy: { createdAt: "desc" },
        take: 30,
      })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Stocktake</h1>
        <p className="text-sm text-muted">
          Count and adjust per-warehouse stock. Adjustments keep sellable totals in parity and are
          recorded in the movement ledger.
        </p>
      </div>

      <StocktakeForm warehouseIds={warehouses.map((w) => w.id)} />

      <div className="rounded-xl border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 text-sm font-bold">
          Recent movements{selected ? ` · ${selected.name}` : ""}
        </h2>
        {movements.length ? (
          <ul className="divide-y divide-border/40">
            {movements.map((movement) => (
              <li
                key={movement.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{movement.product.name}</span>
                  <span className="text-xs text-muted">
                    {movement.reason}
                    {movement.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}
                  </span>
                </span>
                <span
                  className={`shrink-0 font-bold ${
                    movement.delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                  }`}
                >
                  {movement.delta >= 0 ? `+${movement.delta}` : movement.delta}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted">No movements recorded yet.</p>
        )}
      </div>
    </div>
  );
}
