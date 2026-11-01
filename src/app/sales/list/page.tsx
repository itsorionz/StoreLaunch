import Link from "next/link";
import { requireSalesPage } from "@backend/lib/session";
import { db } from "@backend/lib/db";
import { bdStartOfDay } from "@backend/lib/admin-dashboard-periods";
import { OrderSources } from "@backend/lib/enums.mjs";

export const metadata = { title: "Sales" };

const FILTERS = [
  { key: "today", label: "Today" },
  { key: "all", label: "All sales" },
] as const;

export default async function SalesListPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireSalesPage();
  const { filter } = await searchParams;
  const active = FILTERS.some((f) => f.key === filter) ? filter! : "today";

  const orders = await db.order.findMany({
    where: {
      source: OrderSources.SalesRep,
      ...(active === "today" ? { createdAt: { gte: bdStartOfDay() } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      number: true,
      status: true,
      totalCents: true,
      currencySymbol: true,
      recipientName: true,
      phone: true,
      paymentMethod: true,
      paidAt: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Sales</h1>
          <p className="text-sm text-muted">Orders created from the sales counter</p>
        </div>
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`/sales/list?filter=${f.key}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                active === f.key
                  ? "bg-primary/15 text-primary"
                  : "border border-border text-muted hover:bg-surface-2"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface">
        {orders.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5 font-semibold">Order</th>
                  <th className="px-4 py-2.5 font-semibold">Customer</th>
                  <th className="px-4 py-2.5 font-semibold">Phone</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">When</th>
                  <th className="px-4 py-2.5 font-semibold">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.number} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/sales/orders/${order.number}`}
                        className="font-mono text-xs font-semibold text-accent hover:underline"
                      >
                        {order.number}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{order.recipientName}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{order.phone}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">
                      {order.currencySymbol ?? "৳"}
                      {order.totalCents.toLocaleString("en-BD")}
                    </td>
                    <td className="px-4 py-2.5">{order.status}</td>
                    <td className="px-4 py-2.5 text-muted">
                      {order.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/sales/invoice/${order.number}`}
                        className="text-xs font-semibold text-accent hover:underline"
                      >
                        Print
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted">No sales in this period.</p>
        )}
      </div>
    </div>
  );
}
