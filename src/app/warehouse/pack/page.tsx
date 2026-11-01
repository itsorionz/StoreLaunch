import Link from "next/link";
import { requireWarehousePage } from "@backend/lib/session";
import { db } from "@backend/lib/db";

export const metadata = { title: "Pack queue" };

export default async function WarehousePackQueuePage() {
  await requireWarehousePage();
  const pickLists = await db.pickList.findMany({
    where: { status: "Picked" },
    include: {
      order: { select: { number: true, city: true } },
      lines: { select: { id: true, confirmed: true } },
    },
    orderBy: { pickedAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Pack queue</h1>
        <p className="text-sm text-muted">Picked orders awaiting packing confirmation</p>
      </div>

      {pickLists.length ? (
        <ul className="space-y-3">
          {pickLists.map((pl) => {
            const confirmed = pl.lines.filter((line) => line.confirmed).length;
            return (
              <li
                key={pl.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
              >
                <div>
                  <Link
                    href={`/warehouse/pack/${pl.id}`}
                    className="font-mono text-sm font-bold text-accent hover:underline"
                  >
                    {pl.order.number}
                  </Link>
                  <p className="text-xs text-muted">
                    {confirmed}/{pl.lines.length} lines confirmed
                    {pl.order.city ? ` · ${pl.order.city}` : ""}
                  </p>
                </div>
                <Link
                  href={`/warehouse/pack/${pl.id}`}
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary/90"
                >
                  Pack
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          Nothing waiting to be packed.
        </p>
      )}
    </div>
  );
}
