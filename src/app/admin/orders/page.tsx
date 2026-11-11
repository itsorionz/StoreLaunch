import { OrderStatuses } from "@backend/lib/enums.mjs";
import { unstable_noStore } from "next/cache";
import { requireAdminPage } from "@backend/lib/session";
import Link from "next/link";
import { getOrdersList } from "@backend/lib/admin-orders-queries";
import { formatPrice, orderCurrencyLabel } from "@backend/lib/money";
import { PageHeader, StatusBadge } from "@frontend/components/admin/admin-ui";
import { adminOrderQueues } from "@backend/lib/admin-order-queues";
import { adminDashboardPeriods } from "@backend/lib/admin-dashboard-periods";

export const metadata = { title: "Orders — Admin" };

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cod?: string; queue?: string; range?: string }>;
}) {
  unstable_noStore();
  await requireAdminPage();
  const filters = await searchParams;
  const { orders, total } = await getOrdersList({
    status: filters.status,
    cod: filters.cod,
    queue: filters.queue,
    range: filters.range,
  });

  const validStatuses = [
    OrderStatuses.Pending,
    OrderStatuses.Paid,
    OrderStatuses.Processing,
    OrderStatuses.Confirmed,
    OrderStatuses.Packing,
    OrderStatuses.Packed,
    OrderStatuses.Shipped,
    OrderStatuses.Delivered,
    OrderStatuses.Cancelled,
  ] as const;
  const status = validStatuses.find((value) => value === filters.status);

  const unremitted = filters.cod === "unremitted";
  const queues = adminOrderQueues();
  const queue =
    filters.queue && Object.prototype.hasOwnProperty.call(queues, filters.queue)
      ? queues[filters.queue as keyof typeof queues]
      : undefined;
  const period =
    filters.range && ["7", "30", "90"].includes(filters.range ?? "")
      ? adminDashboardPeriods(filters.range)
      : null;

  const tabs = [
    "ALL",
    OrderStatuses.Pending,
    OrderStatuses.Paid,
    OrderStatuses.Processing,
    OrderStatuses.Confirmed,
    OrderStatuses.Packing,
    OrderStatuses.Packed,
    OrderStatuses.Shipped,
    OrderStatuses.Delivered,
    OrderStatuses.Cancelled,
  ];

  return (
    <div className="animate-fade-up">
      <PageHeader title="Orders" subtitle={`${total} order${total === 1 ? "" : "s"}`} />
      {(queue || period) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
          <p>
            {queue?.label ?? "Period orders"}
            {period ? ` · Last ${period.days} days (Bangladesh time)` : ""} · Showing up to 100
            newest matches
          </p>
          <Link href="/admin/orders" className="font-semibold text-primary hover:underline">
            Clear filters
          </Link>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link
          href="/admin/orders?cod=unremitted"
          className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ${unremitted ? "bg-primary text-white" : "border border-border bg-surface text-muted"}`}
        >
          COD awaiting store receipt
        </Link>
        {tabs.map((t) => {
          const active = !unremitted && ((!status && t === "ALL") || status === t);
          return (
            <Link
              key={t}
              href={t === "ALL" ? "/admin/orders" : `/admin/orders?status=${t}`}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                active
                  ? "bg-primary text-white shadow-sm"
                  : "border border-border bg-surface text-muted hover:border-primary hover:text-primary"
              }`}
            >
              {t === "ALL" ? "All" : t}
            </Link>
          );
        })}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs font-semibold uppercase tracking-wider text-muted">
              <th className="px-5 py-3.5">Order</th>
              <th className="px-5 py-3.5">Customer</th>
              <th className="px-5 py-3.5">Items</th>
              <th className="px-5 py-3.5">Total</th>
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-muted">
                  No orders.
                </td>
              </tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="transition-colors:hover:bg-surface-2/50">
                <td className="px-5 py-3.5">
                  <Link
                    href={`/admin/orders/${o.number}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {o.number}
                  </Link>
                </td>
                <td className="px-5 py-3.5">
                  <p className="font-medium">{o.userName}</p>
                  <p className="text-xs text-muted">{o.userEmail}</p>
                </td>
                <td className="px-5 py-3.5">{o.itemsQuantity}</td>
                <td className="px-5 py-3.5 font-semibold">
                  <span>{formatPrice(o.totalCents, orderCurrencyLabel(o))}</span>
                </td>
                <td className="px-5 py-3.5">
                  <StatusBadge status={o.status} />
                </td>
                <td className="px-5 py-3.5 text-muted">{o.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
