import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWarehousePage } from "@backend/lib/session";
import { db } from "@backend/lib/db";
import { MarkPickedButton, PickLineForm } from "@frontend/components/warehouse/pick-controls";

export const metadata = { title: "Pick list" };

export default async function WarehousePickDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireWarehousePage();
  const { id } = await params;
  const pickList = await db.pickList.findUnique({
    where: { id },
    include: {
      order: { select: { number: true, city: true } },
      lines: {
        include: { orderItem: { include: { product: { select: { sku: true, barcode: true } } } } },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!pickList || pickList.status !== "Picking") notFound();

  const allPicked = pickList.lines.every((line) => line.qtyPicked + line.shortPickQty > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/warehouse/pick"
            className="text-sm font-semibold text-accent hover:underline"
          >
            ← Pick queue
          </Link>
          <h1 className="mt-1 font-mono text-lg font-bold tracking-tight">
            {pickList.order.number}
          </h1>
          <p className="text-sm text-muted">
            Pick in bin-code order where bins are set. Short picks need a reason.
          </p>
        </div>
        {allPicked && <MarkPickedButton pickListId={pickList.id} />}
      </div>

      <div className="rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-semibold">Product</th>
                <th className="px-4 py-2.5 font-semibold">SKU</th>
                <th className="px-4 py-2.5 text-right font-semibold">Ordered</th>
                <th className="px-4 py-2.5 font-semibold">Record pick</th>
              </tr>
            </thead>
            <tbody>
              {pickList.lines.map((line) => (
                <tr key={line.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5 font-semibold">{line.orderItem.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {line.orderItem.product.sku ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">{line.qtyOrdered}</td>
                  <td className="px-4 py-2.5">
                    <PickLineForm
                      pickListId={pickList.id}
                      orderItemId={line.orderItemId}
                      qtyOrdered={line.qtyOrdered}
                      lineLocked={line.qtyPicked > 0 || line.shortPickQty > 0}
                    />
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
