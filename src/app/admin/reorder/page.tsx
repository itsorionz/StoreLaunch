import { getReorderReport } from "@backend/lib/ops-intelligence";

export default async function ReorderPage() {
  const suggestions = await getReorderReport();

  return (
    <div className="min-h-screen bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <h1 className="text-2xl font-semibold">Reorder Report</h1>
        <a
          href="/api/admin/reorder/export"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          download
        >
          Export CSV
        </a>
      </div>
      <div className="p-4">
        <p className="text-sm text-muted mb-6">
          Stock rows below their reorder point (per-warehouse override or global default) with
          suggested purchase quantities.
        </p>
        {suggestions.length === 0 ? (
          <div className="p-4 text-center text-muted">
            No products need reordering at this time.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="text-left p-3">Product</th>
                  <th className="text-left p-3">Warehouse</th>
                  <th className="text-right p-3">SKU</th>
                  <th className="text-right p-3">Current Stock</th>
                  <th className="text-right p-3">Reorder Point</th>
                  <th className="text-right p-3">Suggested Qty</th>
                  <th className="text-left p-3">Bin</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => (
                  <tr key={`${s.warehouseId}:${s.productId}`} className="border-b border-border">
                    <td className="p-3">{s.productName}</td>
                    <td className="p-3">{s.warehouseName}</td>
                    <td className="text-right p-3">{s.sku}</td>
                    <td className="text-right p-3">{s.currentStock}</td>
                    <td className="text-right p-3">{s.reorderPoint}</td>
                    <td className="text-right p-3 font-semibold">{s.suggestedQty}</td>
                    <td className="p-3">{s.binCode ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
