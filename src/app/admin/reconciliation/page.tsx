import Link from "next/link";
import { requireAdminPage } from "@backend/lib/session";
import {
  getUnremittedCodCollectionsCount,
  listRecentCodSettlements,
  listUnremittedCodCollections,
} from "@backend/lib/admin-orders-queries";
import {
  COD_AGING_BUCKETS,
  getCodReceivablesReport,
  getCourierReconciliationReport,
} from "@backend/lib/cod-receivables";
import { CodSettlementForm } from "@frontend/components/admin/cod-settlement-form";

export const metadata = { title: "COD reconciliation - Admin" };

const money = (currency: string, cents: number) => `${currency} ${(cents / 100).toFixed(2)}`;

export default async function CodReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdminPage();
  const query = await searchParams;
  const total = await getUnremittedCodCollectionsCount();
  const pages = Math.max(1, Math.ceil(total / 100));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(query.page) || 1)));
  const now = new Date();
  const [collections, settlements, receivables, couriers] = await Promise.all([
    listUnremittedCodCollections(page),
    listRecentCodSettlements(),
    getCodReceivablesReport(now),
    getCourierReconciliationReport(now),
  ]);
  const pending = collections
    .map((row) => ({
      id: row.id,
      orderNumber: row.order.number,
      courier: row.order.deliveryCompany?.name ?? row.courierName,
      amountCents: row.amountCents,
      settledCents: row.settlementLines.reduce((sum, line) => sum + line.appliedCents, 0),
      currencyCode: row.currencyCode,
      collectedAt: row.collectedAt,
    }))
    .filter((row) => row.settledCents < row.amountCents);
  // Per-courier settlement batches (§9.1): one form per courier per currency so
  // a receipt is recorded against a single courier's cash.
  const batches = new Map<string, { courier: string; currency: string; rows: typeof pending }>();
  for (const row of pending) {
    const key = `${row.courier}::${row.currencyCode}`;
    const batch = batches.get(key) ?? {
      courier: row.courier,
      currency: row.currencyCode,
      rows: [],
    };
    batch.rows.push(row);
    batches.set(key, batch);
  }
  const receivableCurrencies = [...new Set(receivables.map((row) => row.currencyCode))].sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">COD reconciliation</h1>
          <p className="mt-1 text-sm text-muted">
            Record cash or deposits per courier, reconcile partial receipts and explain variances.
            This records money physically received; it does not initiate a transfer.
          </p>
        </div>
        <Link className="btn-outline" href="/admin/orders?cod=unremitted">
          Open delivered COD orders
        </Link>
      </div>

      <section
        aria-label="COD receivable summary"
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        {receivableCurrencies.slice(0, 3).map((currency) => {
          const rows = receivables.filter((row) => row.currencyCode === currency);
          const outstandingCents = rows.reduce((sum, row) => sum + row.outstandingCents, 0);
          const overdueCents = rows.reduce(
            (sum, row) => sum + row.buckets.d15.cents + row.buckets.d31.cents,
            0,
          );
          return (
            <div key={currency} className="rounded-xl border border-border bg-surface p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Receivable · {currency}
              </p>
              <p className="mt-2 text-3xl font-black tracking-tight">
                {(outstandingCents / 100).toLocaleString("en-BD", { minimumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-muted">
                {rows.reduce((sum, row) => sum + row.collectionCount, 0)} collections held ·{" "}
                {(overdueCents / 100).toFixed(2)} older than 14 days
              </p>
            </div>
          );
        })}
        {!receivableCurrencies.length && (
          <div className="rounded-xl border border-border bg-surface p-5 sm:col-span-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              No COD receivable
            </p>
            <p className="mt-2 text-sm text-muted">
              Every collected COD batch has been fully remitted.
            </p>
          </div>
        )}
      </section>

      <section aria-label="Outstanding collections" className="space-y-5">
        {[...batches.values()].map((batch) => (
          <div key={`${batch.courier}::${batch.currency}`} className="card p-5">
            <h2 className="font-bold">
              {batch.courier} · {batch.currency}
              <span className="ml-2 text-xs font-normal text-muted">
                {batch.rows.length} collection{batch.rows.length === 1 ? "" : "s"}
              </span>
            </h2>
            <CodSettlementForm collections={batch.rows} courier={batch.courier} />
          </div>
        ))}
        {!pending.length && (
          <div className="card p-6 text-sm text-muted">
            No delivered COD collections are awaiting receipt on this page.
          </div>
        )}
        <nav className="flex justify-between text-sm">
          <Link
            className={page <= 1 ? "pointer-events-none text-muted" : "text-primary"}
            href={`/admin/reconciliation?page=${page - 1}`}
          >
            Previous
          </Link>
          <span>
            Page {page} of {pages} · {total} unremitted collections
          </span>
          <Link
            className={page >= pages ? "pointer-events-none text-muted" : "text-primary"}
            href={`/admin/reconciliation?page=${page + 1}`}
          >
            Next
          </Link>
        </nav>
      </section>

      <section aria-label="COD receivable aging" className="card overflow-x-auto p-5">
        <h2 className="font-bold">Receivable aging by courier</h2>
        <p className="mt-1 text-sm text-muted">
          How long collected cash has been held by each courier, bucketed from the collection day in
          Bangladesh time. Amounts never sum across currencies.
        </p>
        <table className="mt-4 w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              <th className="p-2">Courier</th>
              <th className="p-2">Currency</th>
              {COD_AGING_BUCKETS.map((bucket) => (
                <th key={bucket.key} className="p-2">
                  {bucket.label}
                </th>
              ))}
              <th className="p-2">Outstanding</th>
              <th className="p-2">Oldest held</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {receivables.map((row) => (
              <tr key={`${row.carrierId ?? "unassigned"}:${row.currencyCode}`}>
                <td className="p-2 font-semibold">{row.carrierName}</td>
                <td className="p-2">{row.currencyCode}</td>
                {COD_AGING_BUCKETS.map((bucket) => (
                  <td key={bucket.key} className="p-2">
                    {(row.buckets[bucket.key].cents / 100).toFixed(2)}
                    <span className="block text-xs text-muted">
                      {row.buckets[bucket.key].count} held
                    </span>
                  </td>
                ))}
                <td className="p-2 font-semibold">
                  {money(row.currencyCode, row.outstandingCents)}
                </td>
                <td className="p-2">
                  {row.oldestCollectedAt?.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" }) ??
                    "—"}
                </td>
              </tr>
            ))}
            {!receivables.length && (
              <tr>
                <td className="p-4 text-muted" colSpan={8}>
                  No outstanding COD receivable.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section aria-label="Courier reconciliation report" className="card p-5">
        <h2 className="font-bold">Courier reconciliation report</h2>
        <p className="mt-1 text-sm text-muted">
          Shipped vs delivered vs returned vs lost per carrier, with the COD cash trail. Lost =
          shipped over 14 days ago with no delivery or return outcome yet.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="p-2">Carrier</th>
                <th className="p-2">Shipped</th>
                <th className="p-2">In transit</th>
                <th className="p-2">Delivered</th>
                <th className="p-2">Returned</th>
                <th className="p-2">Cancelled</th>
                <th className="p-2">Lost</th>
                <th className="p-2">Delivery / RTO rate</th>
                <th className="p-2">COD collected → remitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {couriers.map((row) => (
                <tr key={row.carrierId}>
                  <td className="p-2">
                    <span className="font-semibold">{row.carrierName}</span>
                    {!row.active && <span className="block text-xs text-muted">Inactive</span>}
                  </td>
                  <td className="p-2">{row.shippedCount}</td>
                  <td className="p-2">{row.inTransitCount}</td>
                  <td className="p-2">{row.deliveredCount}</td>
                  <td className="p-2">{row.returningCount}</td>
                  <td className="p-2">{row.cancelledCount}</td>
                  <td className={row.lostCount ? "p-2 font-bold text-accent" : "p-2"}>
                    {row.lostCount}
                  </td>
                  <td className="p-2">
                    {Math.round(row.deliveryRatePercent)}% / {Math.round(row.rtoRatePercent)}%
                  </td>
                  <td className="p-2">
                    {row.cod.map((flow) => (
                      <span key={flow.currencyCode} className="block">
                        {money(flow.currencyCode, flow.collectedCents)} →{" "}
                        {money(flow.currencyCode, flow.remittedCents)}
                        {flow.outstandingCents > 0 &&
                          ` · ${(flow.outstandingCents / 100).toFixed(2)} outstanding`}
                      </span>
                    ))}
                    {!row.cod.length && <span className="text-muted">—</span>}
                  </td>
                </tr>
              ))}
              {!couriers.length && (
                <tr>
                  <td className="p-4 text-muted" colSpan={9}>
                    No delivery companies are registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-bold">Settlement ledger</h2>
        <p className="mt-1 text-sm text-muted">
          Latest 50 settlement batches, including partial receipts and documented variances.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="p-2">Date / reference</th>
                <th className="p-2">Courier</th>
                <th className="p-2">Method</th>
                <th className="p-2">Expected</th>
                <th className="p-2">Received</th>
                <th className="p-2">Variance</th>
                <th className="p-2">Order allocations</th>
                <th className="p-2">Received by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {settlements.map((batch) => (
                <tr key={batch.id}>
                  <td className="p-2">
                    {batch.receivedAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}
                    <span className="block text-xs text-muted">{batch.reference}</span>
                  </td>
                  <td className="p-2">
                    {batch.courierName ?? <span className="text-muted">Mixed</span>}
                  </td>
                  <td className="p-2">{batch.method}</td>
                  <td className="p-2">
                    {batch.currencyCode} {(batch.expectedCents / 100).toFixed(2)}
                  </td>
                  <td className="p-2">
                    {batch.currencyCode} {(batch.receivedCents / 100).toFixed(2)}
                  </td>
                  <td className="p-2">
                    {batch.currencyCode} {(batch.varianceCents / 100).toFixed(2)}
                    {batch.varianceReason && (
                      <span className="block text-xs text-muted">{batch.varianceReason}</span>
                    )}
                  </td>
                  <td className="p-2">
                    {batch.lines.map((line) => (
                      <span key={line.id} className="block">
                        #{line.codCollection.order.number}: expected {batch.currencyCode}{" "}
                        {(line.expectedCents / 100).toFixed(2)}, received {batch.currencyCode}{" "}
                        {(line.receivedCents / 100).toFixed(2)}, variance {batch.currencyCode}{" "}
                        {(line.varianceCents / 100).toFixed(2)}
                        {line.varianceReason ? ` — ${line.varianceReason}` : ""}
                      </span>
                    ))}
                  </td>
                  <td className="p-2">{batch.receivedById}</td>
                </tr>
              ))}
              {!settlements.length && (
                <tr>
                  <td className="p-4 text-muted" colSpan={8}>
                    No settlement batches yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
