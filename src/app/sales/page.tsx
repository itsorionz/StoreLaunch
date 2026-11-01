import Link from "next/link";
import { requireSalesPage } from "@backend/lib/session";
import { db } from "@backend/lib/db";
import { bdStartOfDay } from "@backend/lib/admin-dashboard-periods";
import { OrderSources } from "@backend/lib/enums.mjs";
import { getRepCommission } from "@backend/lib/sales-commission";

export const metadata = { title: "Sales dashboard" };

export default async function SalesDashboardPage() {
  const user = await requireSalesPage();
  const start = bdStartOfDay();

  const [today, recent, commission] = await Promise.all([
    db.order.aggregate({
      where: {
        source: OrderSources.SalesRep,
        createdAt: { gte: start },
        status: { not: "Cancelled" },
      },
      _count: { _all: true },
      _sum: { totalCents: true },
    }),
    db.order.findMany({
      where: { source: OrderSources.SalesRep },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        number: true,
        status: true,
        totalCents: true,
        currencySymbol: true,
        recipientName: true,
        paymentMethod: true,
        paidAt: true,
        createdAt: true,
      },
    }),
    getRepCommission(user.id, start),
  ]);

  const revenueCents = today._sum.totalCents ?? 0;
  const symbol = recent[0]?.currencySymbol ?? "৳";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Sales dashboard</h1>
          <p className="text-sm text-muted">Counter sales for today (Bangladesh time)</p>
        </div>
        <Link
          href="/sales/new"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
        >
          New sale
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Sales today</p>
          <p className="mt-2 text-3xl font-black tracking-tight">{today._count._all}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Revenue today</p>
          <p className="mt-2 text-3xl font-black tracking-tight">
            {symbol}
            {revenueCents.toLocaleString("en-BD")}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            My commission today
          </p>
          <p className="mt-2 text-3xl font-black tracking-tight">
            {symbol}
            {commission.commissionCents.toLocaleString("en-BD")}
          </p>
          <p className="mt-1 text-xs text-muted">
            {commission.orders} order{commission.orders === 1 ? "" : "s"} · rate set by admin
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-bold">Recent sales</h2>
          <Link href="/sales/list" className="text-sm font-semibold text-accent hover:underline">
            View all
          </Link>
        </div>
        {recent.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5 font-semibold">Order</th>
                  <th className="px-4 py-2.5 font-semibold">Customer</th>
                  <th className="px-4 py-2.5 font-semibold">Payment</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">When</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((order) => (
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
                    <td className="px-4 py-2.5">
                      {order.paymentMethod === "COD" ? "COD" : "Gateway"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold">
                      {order.currencySymbol ?? "৳"}
                      {order.totalCents.toLocaleString("en-BD")}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-2.5 text-muted">
                      {order.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted">
            No sales yet today. Create the first one from New sale.
          </p>
        )}
      </div>

      <p className="text-xs text-muted">Signed in as {user.name ?? user.email ?? "sales rep"}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "Delivered" || status === "Paid"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : status === "Cancelled"
        ? "bg-red-500/15 text-red-600 dark:text-red-400"
        : "bg-primary/15 text-primary";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {status}
    </span>
  );
}
