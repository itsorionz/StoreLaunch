import {
  listActiveWarehouses,
  listDeliveryHubOptions,
  listDeliveryZones,
} from "@backend/lib/admin-logistics-queries";
import { DeliveryZoneAdmin } from "@frontend/components/admin/delivery-zone-admin";

export const metadata = { title: "Delivery zones" };

export default async function DeliveryZonesPage() {
  const [zones, warehouses, hubs] = await Promise.all([
    listDeliveryZones(),
    listActiveWarehouses(),
    listDeliveryHubOptions(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Delivery zones</h1>
      <DeliveryZoneAdmin
        zones={zones.map((z) => ({
          id: z.id,
          name: z.name,
          areas: z.areas,
          mode: z.mode,
          warehouseId: z.warehouseId,
          deliveryHubId: z.deliveryHubId,
          rateCents: z.rateCents,
          codFeeCents: z.codFeeCents,
          etaDaysFrom: z.etaDaysFrom,
          etaDaysTo: z.etaDaysTo,
          active: z.active,
        }))}
        warehouses={warehouses.map((w) => ({ id: w.id, label: `${w.name} (${w.code})` }))}
        hubs={hubs.map((hub) => ({ id: hub.id, label: `${hub.name} (${hub.code})` }))}
      />
    </div>
  );
}
