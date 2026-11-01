import { OrderStatuses, PaymentMethods } from "@backend/lib/enums.mjs";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getRider } from "@backend/lib/session";
import { getRiderDashboard } from "@backend/lib/rider-dashboard";
import { RiderDashboardSummary } from "@frontend/components/rider/dashboard-summary";
import { RefreshDashboard } from "@frontend/components/rider/refresh-dashboard";
import { formatPrice, orderCurrencyLabel } from "@backend/lib/money";

const statusStyles: Record<string, string> = {
  [OrderStatuses.Pending]: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  [OrderStatuses.Paid]: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  [OrderStatuses.Shipped]: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  [OrderStatuses.Delivered]: "bg-primary/15 text-primary",
  [OrderStatuses.Cancelled]: "bg-muted text-muted",
};

async function RiderDashboard() {
  const ctx = await getRider();
  if (!ctx) redirect("/login?callbackUrl=/rider");

  const data = await getRiderDashboard(ctx.rider.id, ctx.user.id);
  const active = data.active;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Deliveries</h1>
          <p className="mt-1 text-sm text-muted">Your delivery and cash overview.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RefreshDashboard />
          <Link href="/rider/route" className="btn-primary">
            My route
          </Link>
          <Link href="/rider/help" className="btn-outline">
            Help
          </Link>
        </div>
      </div>
      <p className="text-xs text-muted">
        {data.period.dateLabel} ? Bangladesh time (UTC+06:00). Updated{" "}
        {data.period.now.toLocaleTimeString("en-GB", {
          timeZone: "Asia/Dhaka",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
      <RiderDashboardSummary data={data} />
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Active deliveries ({active.length})</h2>
        <Link href="/rider/history" className="text-sm font-semibold text-primary">
          Delivery history ?
        </Link>
      </div>
      {active.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">
          No active deliveries. Completed deliveries are in History.
        </div>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {active.map((o) => {
            const qty = o.items.reduce((s, i) => s + i.quantity, 0);
            const codDue =
              o.paymentMethod === PaymentMethods.COD &&
              o.status !== OrderStatuses.Delivered &&
              o.status !== OrderStatuses.Cancelled
                ? o.totalCents - o.walletPaidCents
                : 0;
            return (
              <li key={o.id}>
                <Link
                  href={`/rider/orders/${o.number}`}
                  className="card flex items-center gap-3 p-4 transition-colors hover:border-primary/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">#{o.number}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusStyles[o.status] ?? "bg-muted text-muted"}`}
                      >
                        {o.status}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">{o.recipientName}</p>
                    <p className="truncate text-xs text-muted">
                      {[o.line1, o.city].filter(Boolean).join(", ")} · {qty} item
                      {qty === 1 ? "" : "s"}
                    </p>
                    {codDue > 0 && (
                      <p className="mt-1 text-xs font-semibold text-accent">
                        Collect {formatPrice(codDue, orderCurrencyLabel(o))}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-muted" aria-hidden>
                    ›
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function RiderHomePage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 w-full rounded-2xl" />}>
      <RiderDashboard />
    </Suspense>
  );
}
