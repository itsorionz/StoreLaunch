import { db } from "@backend/lib/db";
import {
  ConfirmPackLineButton,
  MarkPackedButton,
} from "@frontend/components/warehouse/pack-controls";

export default async function PackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pickList = await db.pickList.findUnique({
    where: { id },
    include: {
      order: { select: { id: true, number: true } },
      lines: { include: { orderItem: { include: { product: true } } } },
    },
  });

  if (!pickList) {
    return (
      <div className="min-h-screen bg-background p-6">
        <p>Pick list not found.</p>
      </div>
    );
  }

  const allConfirmed = pickList.lines.every((line) => line.confirmed);

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Pack Station</h1>
            <p className="text-sm text-muted">Order #: {pickList.order.number}</p>
          </div>
          {allConfirmed && <MarkPackedButton pickListId={pickList.id} />}
        </div>

        {!allConfirmed && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 mb-6">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Confirm all lines before marking as packed.
            </p>
          </div>
        )}

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-3">Product</th>
              <th className="text-left p-3">SKU</th>
              <th className="text-right p-3">Qty Ordered</th>
              <th className="text-right p-3">Qty Picked</th>
              <th className="text-center p-3">Confirmed</th>
            </tr>
          </thead>
          <tbody>
            {pickList.lines.map((line) => (
              <tr key={line.id} className="border-b border-border">
                <td className="p-3">{line.orderItem.name}</td>
                <td className="text-right p-3">{line.orderItem.product.sku || "—"}</td>
                <td className="text-right p-3">{line.qtyOrdered}</td>
                <td className="text-right p-3">{line.qtyPicked}</td>
                <td className="text-center p-3">
                  {line.confirmed ? (
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
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
  );
}
