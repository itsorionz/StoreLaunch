import {
  listActiveWarehouses,
  listRecentStockTransfers,
} from "@backend/lib/admin-logistics-queries";
import { WarehouseTransferForm } from "@frontend/components/admin/warehouse-transfer-form";
import { TransferQueue } from "@frontend/components/admin/transfer-queue";

export const metadata = { title: "Warehouse transfer" };

export default async function WarehouseTransferPage() {
  const [warehouses, transfers] = await Promise.all([
    listActiveWarehouses(),
    listRecentStockTransfers(),
  ]);
  const nameById = new Map(warehouses.map((w) => [w.id, w.name]));

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Warehouse Transfer</h1>
            <p className="text-sm text-muted">
              Request, dispatch and receive stock between warehouses with in-transit tracking
            </p>
          </div>
          <div className="flex gap-2">
            <a href="/admin/warehouse/rebalance" className="btn btn-outline">
              Rebalancing suggestions
            </a>
            <a href="/admin/warehouse" className="btn btn-outline">
              Back to Warehouses
            </a>
          </div>
        </div>

        <div className="space-y-6">
          <WarehouseTransferForm warehouses={warehouses} />
          <TransferQueue
            transfers={transfers.map((t) => ({
              id: t.id,
              productName: t.product.name,
              sku: t.product.sku,
              fromName: nameById.get(t.fromWarehouseId) ?? t.fromWarehouse.name,
              toName: nameById.get(t.toWarehouseId) ?? t.toWarehouse.name,
              qty: t.qty,
              status: t.status,
              note: t.note,
              requestedByName: t.requestedByName,
              dispatchedByName: t.dispatchedByName,
              receivedByName: t.receivedByName,
              requestedAt: t.requestedAt.toISOString(),
              dispatchedAt: t.dispatchedAt?.toISOString() ?? null,
              receivedAt: t.receivedAt?.toISOString() ?? null,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
