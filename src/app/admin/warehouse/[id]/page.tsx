import { getWarehouseById, listWarehouseStockLevels } from "@backend/lib/admin-logistics-queries";

export default async function WarehouseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [warehouse, stockLevels] = await Promise.all([
    getWarehouseById(id),
    listWarehouseStockLevels(id),
  ]);

  if (!warehouse) {
    return (
      <div className="min-h-screen bg-background p-6">
        <p>Warehouse not found.</p>
        <a href="/admin/warehouse" className="btn btn-outline">
          Back to Warehouses
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-semibold">{warehouse.name}</h1>
            <p className="text-sm text-muted">{warehouse.code}</p>
          </div>
          <a href="/admin/warehouse" className="btn btn-outline">
            Back to Warehouses
          </a>
        </div>

        <div className="grid gap-3 sm:grid-cols-4 mb-6">
          <div className="card p-4">
            <p className="text-sm text-muted">Address</p>
            <p className="font-medium">{warehouse.address || "—"}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-muted">Status</p>
            <span
              className={`px-2 py-1 rounded text-xs ${
                warehouse.active
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-accent/15 text-accent"
              }`}
            >
              {warehouse.active ? "Active" : "Inactive"}
            </span>
          </div>
          <div className="card p-4">
            <p className="text-sm text-muted">Default</p>
            <span
              className={`px-2 py-1 rounded text-xs ${
                warehouse.isDefault ? "bg-primary/15 text-primary" : "bg-surface-2 text-muted"
              }`}
            >
              {warehouse.isDefault ? "Yes" : "No"}
            </span>
          </div>
          <div className="card p-4">
            <p className="text-sm text-muted">Total SKUs</p>
            <div className="text-2xl font-bold">{stockLevels.length}</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="text-left p-3">Product</th>
                <th className="text-left p-3">SKU</th>
                <th className="text-left p-3">Barcode</th>
                <th className="text-right p-3">Qty</th>
                <th className="text-left p-3">Bin</th>
              </tr>
            </thead>
            <tbody>
              {stockLevels.map((sl) => (
                <tr key={sl.id} className="border-b border-border">
                  <td className="p-3">{sl.product.name}</td>
                  <td className="text-right p-3 font-mono">{sl.product.sku || "—"}</td>
                  <td className="text-right p-3 font-mono">{sl.product.barcode || "—"}</td>
                  <td className="text-right p-3 font-medium">{sl.qty}</td>
                  <td className="p-3">{sl.binCode || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
