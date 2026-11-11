import Link from "next/link";
import { requireWarehousePage } from "@backend/lib/session";
import { listPrintableOrders } from "@backend/lib/warehouse-queries";

export const metadata = { title: "Print" };

export default async function WarehousePrintPage() {
  await requireWarehousePage();
  const orders = await listPrintableOrders();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Print</h1>
        <p className="text-sm text-muted">Packing slips for orders in preparation</p>
      </div>

      {orders.length ? (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li
              key={order.number}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
            >
              <div>
                <p className="font-mono text-sm font-bold">{order.number}</p>
                <p className="text-xs text-muted">
                  {order.recipientName} · {order.status}
                  {order.city ? ` · ${order.city}` : ""}
                </p>
              </div>
              <Link
                href={`/warehouse/print/slip/${order.number}`}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:bg-surface-2"
              >
                Slip
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          No orders in preparation right now.
        </p>
      )}
    </div>
  );
}
