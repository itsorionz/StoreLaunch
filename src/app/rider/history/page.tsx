import { OrderStatuses } from "@backend/lib/enums.mjs";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getRider } from "@backend/lib/session";
import { getRiderOrderHistory } from "@backend/lib/rider-queries";
import { formatPrice, orderCurrencyLabel } from "@backend/lib/money";

const statusStyles: Record<string, string> = {
  [OrderStatuses.Pending]: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  [OrderStatuses.Paid]: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  [OrderStatuses.Shipped]: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  [OrderStatuses.Delivered]: "bg-primary/15 text-primary",
  [OrderStatuses.Cancelled]: "bg-muted text-muted",
};

async function RiderHistory() {
  const ctx = await getRider();
  if (!ctx) redirect("/login?callbackUrl=/rider");
  const { orders } = await getRiderOrderHistory(ctx.rider.id);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">History</h1>
      {orders.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">No past deliveries yet.</div>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {orders.map((o) => (
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
                    {[o.line1, o.city].filter(Boolean).join(", ")}
                    {o.deliveredAt
                      ? ` · ${new Date(o.deliveredAt).toLocaleDateString("en-GB")}`
                      : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold">
                  {formatPrice(o.totalCents, orderCurrencyLabel(o))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RiderHistoryPage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 w-full rounded-2xl" />}>
      <RiderHistory />
    </Suspense>
  );
}
