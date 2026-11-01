import { getCommissionReport } from "@backend/lib/sales-commission";
import { CommissionTable } from "@frontend/components/admin/commission-table";

export const metadata = { title: "Sales commissions" };

export default async function CommissionPage() {
  const { rows, totals, idleReps } = await getCommissionReport();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Sales commissions</h1>
        <p className="text-sm text-muted">
          Rates are set per rep and applied to each POS order at creation. Existing orders keep
          their snapshot, so editing a rate never rewrites history.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Commission earned
          </p>
          <p className="mt-2 text-3xl font-black tracking-tight">
            ৳{totals.commissionCents.toLocaleString("en-BD")}
          </p>
          <p className="mt-1 text-xs text-muted">All time, cancelled orders excluded</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Attributed revenue
          </p>
          <p className="mt-2 text-3xl font-black tracking-tight">
            ৳{totals.revenueCents.toLocaleString("en-BD")}
          </p>
          <p className="mt-1 text-xs text-muted">From sales-rep orders</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Rep orders</p>
          <p className="mt-2 text-3xl font-black tracking-tight">{totals.orders}</p>
          <p className="mt-1 text-xs text-muted">
            Across {rows.length} rep account{rows.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <CommissionTable rows={rows} />

      {idleReps.length > 0 && (
        <p className="text-xs text-muted">
          Reps with no attributed orders yet: {idleReps.map((rep) => rep.name).join(", ")}.
        </p>
      )}
    </div>
  );
}
