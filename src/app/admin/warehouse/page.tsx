import { db } from "@backend/lib/db";
import { getLowStockAlerts } from "@backend/lib/low-stock";
import { WarehouseManager } from "@frontend/components/admin/warehouse-manager";
import { LowStockAlerts } from "@frontend/components/warehouse/low-stock-alerts";

export default async function WarehousePage() {
  const [warehouses, alerts] = await Promise.all([
    db.warehouse.findMany({
      include: { stockLevels: true },
      orderBy: { name: "asc" },
    }),
    getLowStockAlerts(),
  ]);

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 space-y-6">
        <WarehouseManager
          warehouses={warehouses.map((w) => ({
            id: w.id,
            name: w.name,
            code: w.code,
            address: w.address,
            isDefault: w.isDefault,
            active: w.active,
            stockLevelCount: w.stockLevels.length,
          }))}
        />
        <div>
          <h2 className="mb-3 text-sm font-bold">Low stock alerts</h2>
          <LowStockAlerts alerts={alerts.slice(0, 30)} canRebalance />
        </div>
      </div>
    </div>
  );
}
