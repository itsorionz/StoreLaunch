import Link from "next/link";
import type { getRiderDashboard } from "@backend/lib/rider-dashboard";
import { formatPrice } from "@backend/lib/money";

type Dashboard = Awaited<ReturnType<typeof getRiderDashboard>>;
function MoneyLines({
  amounts,
  empty = "No cash recorded",
}: {
  amounts: { currencyCode: string; amount: number }[];
  empty?: string;
}) {
  const nonzero = amounts.filter((row) => row.amount !== 0);
  return nonzero.length ? (
    <ul className="space-y-1">
      {nonzero.map((row) => (
        <li key={row.currencyCode} className="break-words font-bold tabular-nums">
          {formatPrice(row.amount, `${row.currencyCode} `)}
        </li>
      ))}
    </ul>
  ) : (
    <span className="text-sm font-medium text-muted">{empty}</span>
  );
}

function DeliveryChart({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; label: string; count: number }[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <section className="card p-5">
      <h2 className="font-bold">{title}</h2>
      <p className="mt-1 text-xs text-muted">Completed deliveries · Bangladesh time</p>
      <div
        className="mt-5 flex gap-2"
        role="img"
        aria-label={rows.map((row) => `${row.label}: ${row.count} deliveries`).join(", ")}
      >
        {rows.map((row) => (
          <div key={row.key} className="min-w-0 flex-1 text-center">
            <div className="flex h-36 flex-col justify-end">
              <span className="mb-1 text-sm font-bold tabular-nums">{row.count}</span>
              <div
                className="mx-auto w-full max-w-12 rounded-t-lg bg-primary"
                style={{
                  height: `${(row.count / max) * 100}%`,
                  minHeight: row.count ? "4px" : "0",
                }}
              />
            </div>
            <p className="mt-2 text-[10px] leading-tight text-muted sm:text-xs">{row.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function RiderDashboardSummary({ data }: { data: Dashboard }) {
  const deliveryCards = [
    ["Delivered today", data.delivered.today, "Since midnight in Bangladesh", "delivered-today"],
    ["Delivered this week", data.delivered.week, "Monday to today", "delivered-week"],
    ["Delivered this month", data.delivered.month, data.period.monthLabel, "delivered-month"],
    ["Total delivered", data.delivered.total, "All completed assignments", "delivered-total"],
  ] as const;
  const cashCards = [
    {
      title: "COD collected today",
      field: "today" as const,
      hint: "Actual cash collected today",
      metric: "cash-today",
      empty: "No cash collected today",
    },
    {
      title: "COD collected this month",
      field: "month" as const,
      hint: "Actual cash collected this month",
      metric: "cash-month",
      empty: "No cash collected this month",
    },
    {
      title: "Cash awaiting store receipt",
      field: "held" as const,
      hint: "Unremitted collections from all dates",
      metric: "cash-held",
      empty: "No cash awaiting receipt",
    },
    {
      title: "Store received this month",
      field: "handoverMonth" as const,
      hint: "Receipts confirmed by an admin this month",
      metric: "cash-remitted-month",
      empty: "No store receipts this month",
    },
  ];
  const operationCards = [
    ["Ready for pickup", data.awaitingPickup],
    ["Out for delivery", data.outForDelivery],
    ["Awaiting payment", data.awaitingPayment],
    ["Retries due", data.retriesDue],
    ["Attempts recorded today", data.todayAttempts],
    ["Cancelled assignments (all time)", data.cancelled],
  ] as const;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {deliveryCards.map(([title, value, hint, metric]) => (
          <div key={metric} data-metric={metric} className="card p-4 sm:p-5">
            <p className="text-xs font-medium text-muted">{title}</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
            <p className="mt-1 text-xs text-muted">{hint}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cashCards.map((card) => (
          <div key={card.metric} data-metric={card.metric} className="card p-5">
            <p className="text-xs font-medium text-muted">{card.title}</p>
            <div className="mt-2 text-xl">
              <MoneyLines
                amounts={data.cash.map((row) => ({
                  currencyCode: row.currencyCode,
                  amount: row[card.field],
                }))}
                empty={card.empty}
              />
            </div>
            <p className="mt-2 text-xs text-muted">{card.hint}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-primary-light px-4 py-3 text-xs">
        <p>
          COD figures are collected cash, not rider earnings. Different currencies are shown
          separately.
        </p>
        <Link href="/rider/cash" className="font-semibold text-primary">
          View cash & receipts →
        </Link>
      </div>
      {data.cash.some((row) => row.invalidDates > 0) && (
        <p className="rounded-lg bg-accent/5 p-3 text-xs text-accent">
          Some collection records have future timestamps. Cash held still includes their unremitted
          amounts; dated totals exclude future collections. Ask dispatch to review the original
          records.
        </p>
      )}
      {data.delivered.undated > 0 && (
        <p className="text-xs text-muted">
          {data.delivered.undated} historical completed deliveries have no delivery timestamp. They
          appear in the total, but not in daily or monthly figures.
        </p>
      )}
      <section className="card grid grid-cols-2 gap-4 p-5 lg:grid-cols-3 xl:grid-cols-6">
        {operationCards.map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <DeliveryChart title="Daily deliveries · last 7 days" rows={data.daily} />
        <DeliveryChart title="Monthly deliveries · last 6 months" rows={data.monthly} />
      </div>
      <section className="card overflow-hidden">
        <div className="p-5">
          <h2 className="font-bold">Monthly performance & cash collection</h2>
          <p className="mt-1 text-xs text-muted">
            Delivery counts use completion dates. COD uses the cash collection date. The current
            month is month-to-date.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th className="px-5 py-3">Month</th>
                <th className="px-5 py-3">Delivered</th>
                <th className="px-5 py-3">COD collected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...data.monthly].reverse().map((row) => (
                <tr key={row.key}>
                  <th className="whitespace-nowrap px-5 py-3 font-medium">{row.label}</th>
                  <td className="px-5 py-3 tabular-nums">{row.count}</td>
                  <td className="px-5 py-3">
                    <MoneyLines amounts={row.cash} empty="No collections" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card flex flex-wrap items-start justify-between gap-4 p-5">
        <div>
          <h2 className="font-bold">Still to collect on active COD orders</h2>
          <p className="mt-1 text-xs text-muted">
            Expected cash due after wallet payments. This has not been collected yet.
          </p>
          {data.unknownCashOrders > 0 && (
            <p className="mt-2 text-xs text-accent">
              {data.unknownCashOrders} orders have unrecorded currency. Ask dispatch to confirm it
              before collecting.
            </p>
          )}
        </div>
        <MoneyLines amounts={data.remaining} empty="No remaining COD due" />
      </section>
    </>
  );
}
