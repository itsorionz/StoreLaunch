import Link from "next/link";
import { requireWarehousePage } from "@backend/lib/session";
import { listWarehousePickQueue } from "@backend/lib/warehouse-queries";

export const metadata = { title: "Pick queue" };

export default async function WarehousePickQueuePage() {
  await requireWarehousePage();
  const pickLists = await listWarehousePickQueue();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Pick queue</h1>
        <p className="text-sm text-muted">Orders in Packing status awaiting their pick list</p>
      </div>

      {pickLists.length ? (
        <ul className="space-y-3">
          {pickLists.map((pl) => (
            <li
              key={pl.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
            >
              <div>
                <Link
                  href={`/warehouse/pick/${pl.id}`}
                  className="font-mono text-sm font-bold text-accent hover:underline"
                >
                  {pl.order.number}
                </Link>
                <p className="text-xs text-muted">
                  {pl.lines.length} line{pl.lines.length === 1 ? "" : "s"} ·{" "}
                  {pl.order.warehouse?.name ?? "unassigned warehouse"}
                  {pl.order.city ? ` · ${pl.order.city}` : ""}
                </p>
              </div>
              <Link
                href={`/warehouse/pick/${pl.id}`}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary/90"
              >
                Start picking
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          Nothing to pick right now. Orders appear here once they enter Packing.
        </p>
      )}
    </div>
  );
}
