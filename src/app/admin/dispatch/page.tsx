import Link from "next/link";
import { connection } from "next/server";
import {
  listActiveDeliveryCompaniesWithProviderKey,
  listDispatchManifests,
  listPackedOrdersReadyForDispatch,
} from "@backend/lib/admin-orders-queries";
import { bdDayKey } from "@backend/lib/admin-dashboard-periods";
import { DispatchBoard } from "@frontend/components/admin/dispatch-board";

export const metadata = { title: "Dispatch" };

export default async function DispatchPage() {
  // Manifests are "today's" per the Bangladesh day key; resolve per request.
  await connection();
  const dayKey = bdDayKey(new Date());

  const [manifests, readyOrders, companies] = await Promise.all([
    listDispatchManifests(dayKey),
    listPackedOrdersReadyForDispatch(),
    listActiveDeliveryCompaniesWithProviderKey(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Dispatch board</h1>
          <p className="text-sm text-muted">
            Packed orders ready to leave the warehouse, with today&apos;s per-courier manifests (
            {dayKey}).
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/shipments" className="btn btn-outline">
            Shipments
          </Link>
          <Link href="/admin/orders" className="btn btn-outline">
            Orders
          </Link>
        </div>
      </div>

      <DispatchBoard
        dayKey={dayKey}
        manifests={manifests.map((manifest) => ({
          id: manifest.id,
          number: manifest.number,
          carrierName: manifest.deliveryCompany?.name ?? "Own rider / warehouse",
          status: manifest.status,
          lines: manifest._count.lines,
          handedOverAt: manifest.handedOverAt?.toISOString() ?? null,
        }))}
        readyOrders={readyOrders.map((order) => ({
          id: order.id,
          number: order.number,
          recipientName: order.recipientName,
          zoneName: order.zone?.name ?? null,
          zoneOwnRider: order.zone?.mode === "OwnRider",
          currentCarrier: order.deliveryCompany?.name ?? null,
          totalLabel: `${order.currencySymbol ?? "৳"}${order.totalCents.toLocaleString("en-BD")}`,
        }))}
        companies={companies.map((company) => ({
          id: company.id,
          name: company.name,
        }))}
      />
    </div>
  );
}
