import { getPickListDetail } from "@backend/lib/admin-orders-queries";
import { MarkPickedButton, PickLineForm } from "@frontend/components/warehouse/pick-controls";

export default async function PickDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pickList = await getPickListDetail(id);

  if (!pickList) {
    return (
      <div className="min-h-screen bg-background p-6">
        <p>Pick list not found.</p>
      </div>
    );
  }

  const allPicked = pickList.lines.every((line) => line.qtyPicked + line.shortPickQty > 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Pick List #{pickList.order.number}</h1>
            <p className="text-sm text-muted">Pick list ID: {pickList.id}</p>
          </div>
          {allPicked && <MarkPickedButton pickListId={pickList.id} />}
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-3">Product</th>
              <th className="text-left p-3">SKU</th>
              <th className="text-right p-3">Qty Ordered</th>
              <th className="text-right p-3">Qty Picked</th>
              <th className="text-right p-3">Short Pick</th>
              <th className="text-left p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {pickList.lines.map((line) => (
              <tr key={line.id} className="border-b border-border">
                <td className="p-3">{line.orderItem.name}</td>
                <td className="text-right p-3">{line.orderItem.product.sku || "—"}</td>
                <td className="text-right p-3">{line.qtyOrdered}</td>
                <td className="text-right p-3">{line.qtyPicked}</td>
                <td className="text-right p-3 text-accent">{line.shortPickQty}</td>
                <td className="text-left p-3">
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
  );
}
