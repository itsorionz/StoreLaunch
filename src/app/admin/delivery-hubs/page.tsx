import { db } from "@backend/lib/db";
import { bdStartOfDay } from "@backend/lib/admin-dashboard-periods";
import { HubManager } from "@frontend/components/admin/hub-manager";

export const metadata = { title: "Delivery hubs" };

export default async function DeliveryHubsPage() {
  // Capacity counts use "now" (Bangladesh day); only resolve against a request.
  const dayStart = bdStartOfDay();
  const [hubs, warehouses, assignedCounts] = await Promise.all([
    db.deliveryHub.findMany({
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: { warehouse: { select: { name: true } } },
    }),
    db.warehouse.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
    db.order.groupBy({
      by: ["deliveryHubId"],
      where: { deliveryHubId: { not: null }, createdAt: { gte: dayStart } },
      _count: { _all: true },
    }),
  ]);
  const countsByHub = new Map(
    assignedCounts
      .filter((row) => row.deliveryHubId)
      .map((row) => [row.deliveryHubId as string, row._count._all]),
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6">
        <HubManager
          warehouses={warehouses}
          hubs={hubs.map((hub) => ({
            id: hub.id,
            name: hub.name,
            code: hub.code,
            address: hub.address,
            city: hub.city,
            region: hub.region,
            warehouseId: hub.warehouseId,
            warehouseName: hub.warehouse?.name ?? null,
            capacity: hub.capacity,
            assignedToday: countsByHub.get(hub.id) ?? 0,
            isDefault: hub.isDefault,
            active: hub.active,
          }))}
        />
      </div>
    </div>
  );
}
