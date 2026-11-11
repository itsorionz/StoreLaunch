import { requireSalesPage } from "@backend/lib/session";
import { listActiveDeliveryZones } from "@backend/lib/sales-queries";
import { SalePos } from "@frontend/components/sales/sale-pos";

export const metadata = { title: "New sale" };

export default async function NewSalePage() {
  await requireSalesPage();
  const zones = await listActiveDeliveryZones();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">New sale</h1>
        <p className="text-sm text-muted">
          Ring up a walk-in or phone order. Stock is reserved at the fulfilling warehouse the same
          way as online checkout.
        </p>
      </div>
      <SalePos zones={zones} />
    </div>
  );
}
