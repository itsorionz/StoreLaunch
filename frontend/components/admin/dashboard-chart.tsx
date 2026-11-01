"use client";

import { useState } from "react";
import { formatPrice } from "@backend/lib/money";

export function DashboardChart({
  days,
  currencySymbol,
}: {
  days: Array<{ key: string; label: string; orders: number; paidValue: number }>;
  currencySymbol: string;
}) {
  const [metric, setMetric] = useState<"paidValue" | "orders">("paidValue");
  const [selected, setSelected] = useState<number | null>(null);
  const maximum = Math.max(1, ...days.map((day) => day[metric]));
  const total = days.reduce((sum, day) => sum + day[metric], 0);
  const current = selected === null ? null : days[selected];
  const value = (amount: number) =>
    metric === "paidValue" ? formatPrice(amount, currencySymbol) : `${amount} orders`;
  return (
    <section className="card min-w-0 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-bold">Performance trend</h2>
          <p className="mt-1 text-xs text-muted">Daily activity in Bangladesh time</p>
        </div>
        <div className="flex rounded-lg bg-surface-2 p-1 text-xs font-semibold">
          {(
            [
              ["paidValue", "Paid value"],
              ["orders", "Orders"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={metric === key}
              onClick={() => {
                setMetric(key);
                setSelected(null);
              }}
              className={`rounded-md px-3 py-2 transition-colors ${metric === key ? "bg-surface text-primary shadow-sm" : "text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div
        className="mt-5 flex min-h-12 flex-wrap items-baseline gap-x-3 gap-y-1"
        aria-live="polite"
      >
        <p className="text-2xl font-bold tracking-tight">
          {value(current ? current[metric] : total)}
        </p>
        <p className="text-xs text-muted">{current ? current.label : "Selected period total"}</p>
      </div>
      <div
        className="relative mt-5 h-44 border-b border-border"
        role="img"
        aria-label={`${metric === "paidValue" ? "Paid order value" : "Orders"} by day; exact values available in the daily data table`}
      >
        <div
          className="pointer-events-none absolute inset-0 flex flex-col justify-between"
          aria-hidden
        >
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="border-t border-dashed border-border/70" />
          ))}
        </div>
        <div
          className="relative grid h-full items-end gap-0.5 sm:gap-1"
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
          onMouseLeave={() => setSelected(null)}
        >
          {days.map((day, index) => (
            <div
              key={day.key}
              title={`${day.label}: ${value(day[metric])}`}
              onMouseEnter={() => setSelected(index)}
              className="flex h-full items-end"
            >
              <span
                className={`w-full rounded-t-sm transition-colors ${selected === index ? "bg-primary-dark" : "bg-primary/75"}`}
                style={{
                  height: day[metric] ? `${Math.max(2, (day[metric] / maximum) * 100)}%` : "2px",
                  opacity: day[metric] ? 1 : 0.15,
                }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted">
        <span>{days[0].label}</span>
        <span>{days[Math.floor(days.length / 2)].label}</span>
        <span>{days.at(-1)?.label}</span>
      </div>
      {total === 0 && (
        <p className="mt-3 text-xs text-muted">
          No {metric === "paidValue" ? "confirmed paid value" : "orders"} in this period.
        </p>
      )}
      <details className="mt-4 text-xs">
        <summary className="cursor-pointer font-semibold text-primary">View daily data</summary>
        <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-border">
          <table className="w-full text-left">
            <caption className="sr-only">Daily order count and paid order value</caption>
            <thead className="sticky top-0 bg-surface-2">
              <tr>
                <th className="p-2">Date</th>
                <th className="p-2 text-right">Orders</th>
                <th className="p-2 text-right">Paid value</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.key} className="border-t border-border">
                  <td className="p-2">{day.key}</td>
                  <td className="p-2 text-right">{day.orders}</td>
                  <td className="p-2 text-right">{formatPrice(day.paidValue, currencySymbol)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
