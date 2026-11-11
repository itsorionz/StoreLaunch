import {
  countOrdersPerDeliveryHubSince,
  listActiveWarehouses,
  listDeliveryHubs,
} from "@backend/lib/admin-logistics-queries";
import { bdStartOfDay } from "@backend/lib/admin-dashboard-periods";
import { HubManager } from "@frontend/components/admin/hub-manager";
import { unstable_noStore } from "next/cache";
import { connection } from "next/server";

export const metadata = { title: "Delivery hubs" };

export default async function DeliveryHubsPage() {
  unstable_noStore();
  await connection();
  // Capacity counts use "now" (Bangladesh day); only resolve against a request.
  const dayStart = bdStartOfDay();
  const [hubs, warehouses, assignedCounts] = await Promise.all([
    listDeliveryHubs(),
    listActiveWarehouses(),
    countOrdersPerDeliveryHubSince(dayStart),
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
