import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWarehousePage } from "@backend/lib/session";
import { db } from "@backend/lib/db";
import {
  ConfirmPackLineButton,
  MarkPackedButton,
} from "@frontend/components/warehouse/pack-controls";

export const metadata = { title: "Pack station" };

export default async function WarehousePackDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireWarehousePage();
  const { id } = await params;
  const pickList = await db.pickList.findUnique({
    where: { id },
    include: {
      order: { select: { number: true, recipientName: true } },
      lines: { include: { orderItem: true }, orderBy: { id: "asc" } },
    },
  });
  if (!pickList || pickList.status !== "Picked") notFound();

  const allConfirmed = pickList.lines.every((line) => line.confirmed);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/warehouse/pack"
            className="text-sm font-semibold text-accent hover:underline"
          >
            ← Pack queue
          </Link>
          <h1 className="mt-1 font-mono text-lg font-bold tracking-tight">
            {pickList.order.number}
          </h1>
          <p className="text-sm text-muted">
            Verify each line before packing · {pickList.order.recipientName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/warehouse/print/slip/${pickList.order.number}`}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2"
          >
            Packing slip
          </Link>
          {allConfirmed && <MarkPackedButton pickListId={pickList.id} />}
        </div>
      </div>

      {!allConfirmed && (
        <p className="rounded-lg bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-600 dark:text-amber-400">
          Confirm every line before marking the order as packed.
        </p>
      )}

      <div className="rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-semibold">Product</th>
                <th className="px-4 py-2.5 text-right font-semibold">Ordered</th>
                <th className="px-4 py-2.5 text-right font-semibold">Picked</th>
                <th className="px-4 py-2.5 font-semibold">Confirmed</th>
              </tr>
            </thead>
            <tbody>
              {pickList.lines.map((line) => (
                <tr key={line.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5 font-semibold">{line.orderItem.name}</td>
                  <td className="px-4 py-2.5 text-right">{line.qtyOrdered}</td>
                  <td className="px-4 py-2.5 text-right">
                    {line.qtyPicked}
                    {line.shortPickQty > 0 && (
                      <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">
                        (short {line.shortPickQty})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {line.confirmed ? (
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        ✓ Confirmed
                      </span>
                    ) : (
                      <ConfirmPackLineButton
                        pickListId={pickList.id}
                        orderItemId={line.orderItemId}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
