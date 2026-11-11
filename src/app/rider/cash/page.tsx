import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getOutstandingCodCollections,
  getRecentCodSettlementLines,
  getRemittedCodCollections,
} from "@backend/lib/cod-collection-queries";
import { getRider } from "@backend/lib/session";
import { formatPrice } from "@backend/lib/money";

export default async function RiderCashPage() {
  const ctx = await getRider();
  if (!ctx) redirect("/login?callbackUrl=/rider/cash");
  const [outstanding, recent, legacyRecent] = await Promise.all([
    getOutstandingCodCollections(ctx.user.id, ctx.user.role),
    getRecentCodSettlementLines(ctx.user.id, ctx.user.role),
    getRemittedCodCollections(ctx.user.id, ctx.user.role),
  ]);
  const totals = new Map<string, number>();
  for (const row of outstanding)
    totals.set(
      row.currencyCode,
      (totals.get(row.currencyCode) ?? 0) +
        Math.max(
          0,
          row.amountCents - row.settlementLines.reduce((sum, line) => sum + line.appliedCents, 0),
        ),
    );
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Cash & handover</h1>
      <p className="text-sm text-muted">
        Collected COD cash awaiting confirmation of receipt by the store. This is cash held, not
        rider earnings.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[...totals].map(([code, amount]) => (
          <div key={code} className="card p-5">
            <p className="text-sm text-muted">Awaiting store receipt · {code}</p>
            <p className="mt-2 text-2xl font-bold">{formatPrice(amount, `${code} `)}</p>
          </div>
        ))}
      </div>
      <section className="card p-5">
        <h2 className="font-bold">To hand over ({outstanding.length})</h2>
        <p className="mt-2 text-sm text-muted">
          Hand cash to the store using its agreed process. Ask the admin to record a receipt or
          deposit reference. Only the store can confirm receipt.
        </p>
        {!outstanding.length && <p className="mt-4 text-sm">No unremitted collections.</p>}
        <ul className="mt-4 divide-y divide-border">
          {outstanding.map((row) => {
            const remaining = Math.max(
              0,
              row.amountCents -
                row.settlementLines.reduce((sum, line) => sum + line.appliedCents, 0),
            );
            return (
              <li key={row.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm">
                <Link
                  href={`/rider/orders/${row.order.number}`}
                  className="font-semibold text-primary"
                >
                  #{row.order.number}
                </Link>
                <span>Remaining to hand over {formatPrice(remaining, `${row.currencyCode} `)}</span>
                <time>
                  {row.collectedAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })} BD
                </time>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="card p-5">
        <h2 className="font-bold">Recent store receipts</h2>
        {!recent.length && !legacyRecent.length && (
          <p className="mt-3 text-sm text-muted">No confirmed receipts yet.</p>
        )}
        <ul className="mt-3 divide-y divide-border">
          {recent.map((row) => (
            <li key={row.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm">
              <span>#{row.codCollection.order.number}</span>
              <span>{formatPrice(row.receivedCents, `${row.settlement.currencyCode} `)}</span>
              <span>
                {row.settlement.reference} ·{" "}
                {row.settlement.receivedAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}
              </span>
            </li>
          ))}
          {legacyRecent.map((row) => (
            <li key={row.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm">
              <span>#{row.order.number}</span>
              <span>{formatPrice(row.amountCents, `${row.currencyCode} `)}</span>
              <span>
                {row.remittanceReference} ·{" "}
                {row.remittedAt?.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
