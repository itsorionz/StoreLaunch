import Link from "next/link";
import { db } from "@backend/lib/db";
import { isSyncableShipment } from "@backend/lib/shipment-sync";
import {
  CreateShipmentForm,
  ShipmentSyncButton,
} from "@frontend/components/admin/shipment-actions";

export const metadata = { title: "Shipments" };

export default async function ShipmentsPage() {
  const [shipments, orders, companies] = await Promise.all([
    db.shipment.findMany({
      include: {
        order: {
          select: { number: true, recipientName: true, totalCents: true, currencySymbol: true },
        },
        deliveryCompany: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.order.findMany({
      where: { shipment: null, status: { notIn: ["Cancelled"] } },
      select: { id: true, number: true, recipientName: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.deliveryCompany.findMany({
      where: { active: true },
      select: { id: true, name: true, providerKey: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Shipments</h1>
          <p className="text-sm text-muted">
            Tracking, carrier status sync and printable labels for every dispatched order.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/dispatch" className="btn btn-outline">
            Dispatch board
          </Link>
        </div>
      </div>

      <section className="card p-5">
        <div className="mb-4">
          <h2 className="font-bold">All shipments</h2>
          <p className="mt-1 text-sm text-muted">
            API shipments also poll automatically every few minutes via{" "}
            <code className="rounded bg-surface-2 px-1">/api/jobs/shipment-sync</code>; Sync now
            forces an immediate refresh.
          </p>
        </div>
        {shipments.length === 0 ? (
          <p className="rounded-lg bg-surface-2 px-4 py-6 text-center text-sm text-muted">
            No shipments yet. Dispatch a packed order to create one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-3 py-2.5 font-semibold">Order</th>
                  <th className="px-3 py-2.5 font-semibold">Tracking</th>
                  <th className="px-3 py-2.5 font-semibold">Courier</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Mode</th>
                  <th className="px-3 py-2.5 font-semibold">Last sync</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((shipment) => {
                  const syncable = isSyncableShipment(shipment);
                  return (
                    <tr key={shipment.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/admin/orders/${shipment.order?.number ?? ""}`}
                          className="font-mono text-xs font-semibold text-accent hover:underline"
                        >
                          {shipment.order?.number ?? "—"}
                        </Link>
                        <span className="block text-xs text-muted">
                          {shipment.order?.recipientName ?? ""}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">
                        {shipment.trackingNumber ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        {shipment.deliveryCompany?.name ?? (
                          <span className="text-muted">Own rider / unassigned</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                          {shipment.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {shipment.providerMode === "Api" ? "API" : "Manual"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted">
                        {shipment.lastSyncedAt
                          ? new Date(shipment.lastSyncedAt).toLocaleString("en-GB", {
                              timeZone: "Asia/Dhaka",
                            })
                          : "never"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            href={`/admin/shipments/${shipment.id}/label`}
                            className="btn btn-sm btn-outline"
                          >
                            Label
                          </Link>
                          <ShipmentSyncButton shipmentId={shipment.id} enabled={syncable} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CreateShipmentForm
        orders={orders.map((order) => ({
          id: order.id,
          label: `${order.number} — ${order.recipientName}`,
        }))}
        companies={companies.map((company) => ({ id: company.id, name: company.name }))}
      />
    </div>
  );
}
