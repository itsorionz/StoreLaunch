import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSalesPage } from "@backend/lib/session";
import { db } from "@backend/lib/db";
import { OrderSources } from "@backend/lib/enums.mjs";
import { PrintButton } from "@frontend/components/sales/print-button";

export const metadata = { title: "Sale" };

export default async function SalesOrderPage({ params }: { params: Promise<{ number: string }> }) {
  await requireSalesPage();
  const { number } = await params;
  const order = await db.order.findUnique({
    where: { number },
    include: {
      items: true,
      warehouse: { select: { name: true, code: true } },
      deliveryCompany: { select: { name: true } },
      rider: { select: { name: true, phone: true } },
      events: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          message: true,
          actorName: true,
          createdAt: true,
        },
      },
    },
  });
  if (!order || order.source !== OrderSources.SalesRep) notFound();

  const symbol = order.currencySymbol ?? "৳";
  const fmt = (cents: number) =>
    `${symbol}${(cents / 100).toLocaleString("en-BD", { minimumFractionDigits: 2 })}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/sales/list" className="text-sm font-semibold text-accent hover:underline">
            ← Back to sales
          </Link>
          <h1 className="mt-1 font-mono text-lg font-bold tracking-tight">{order.number}</h1>
          <p className="text-sm text-muted">
            {order.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })} · {order.status}
            {order.paidAt ? " · Paid" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/sales/invoice/${order.number}`}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2"
          >
            Invoice
          </Link>
          <PrintButton label="Packing slip" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-4 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Customer</h2>
          <p className="mt-2 font-semibold">{order.recipientName}</p>
          <p className="font-mono text-xs">{order.phone}</p>
        </section>
        <section className="rounded-xl border border-border bg-surface p-4 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Fulfilment</h2>
          <p className="mt-2">
            Warehouse:{" "}
            {order.warehouse ? `${order.warehouse.name} (${order.warehouse.code})` : "Not routed"}
          </p>
          <p>
            Carrier:{" "}
            {order.rider
              ? `Rider ${order.rider.name}`
              : (order.deliveryCompany?.name ?? "Unassigned")}
          </p>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 text-sm font-bold">Items</h2>
        <table className="w-full text-sm">
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-2.5">{item.name}</td>
                <td className="px-4 py-2.5 text-right">× {item.quantity}</td>
                <td className="px-4 py-2.5 text-right font-semibold">
                  {fmt(item.priceCents * item.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border">
              <td colSpan={2} className="px-4 py-2.5 text-right text-muted">
                Subtotal {fmt(order.subtotalCents)} · Shipping {fmt(order.shippingCents)}
              </td>
              <td className="px-4 py-2.5 text-right text-base font-black">
                {fmt(order.totalCents)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="rounded-xl border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 text-sm font-bold">History</h2>
        <ul className="divide-y divide-border/40">
          {order.events.map((event) => (
            <li key={event.id} className="px-4 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{event.type}</span>
                <span className="text-xs text-muted">
                  {event.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}
                </span>
              </div>
              {event.message && <p className="text-xs text-muted">{event.message}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
