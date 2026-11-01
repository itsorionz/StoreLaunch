import { db } from "@backend/lib/db";
import { DeliveryZoneAdmin } from "@frontend/components/admin/delivery-zone-admin";

export const metadata = { title: "Delivery zones" };

export default async function DeliveryZonesPage() {
  const [zones, warehouses, hubs] = await Promise.all([
    db.deliveryZone.findMany({
      orderBy: { name: "asc" },
    }),
    db.warehouse.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
    db.deliveryHub.findMany({
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, name: true, code: true },
    }),
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
