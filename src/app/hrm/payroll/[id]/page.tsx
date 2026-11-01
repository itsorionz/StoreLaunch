import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHrmPage } from "@backend/lib/session";
import { getPayrollRun } from "@backend/lib/hrm-payroll";
import { formatPrice } from "@backend/lib/money";
import { PageHeader, StatusBadge } from "@frontend/components/admin/admin-ui";
import { RunActions, PayslipPayButton } from "@frontend/components/hrm/payroll-controls";
import { PayslipAdjustmentsForm } from "@frontend/components/hrm/payslip-adjustments-form";

export const metadata = { title: "Payroll run | HRM" };

export default async function Hrm({ params }: { params: Promise<{ id: string }> }) {
  await requireHrmPage();
  const { id } = await params;
  const run = await getPayrollRun(id);
  if (!run) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Payroll — ${run.monthKey}`}
        subtitle={`${run.currencyCode} · ${run.headcount} employees · created by ${run.createdBy?.name ?? "system"}`}
        action={
          <div className="flex items-center gap-3">
            <StatusBadge status={run.status} />
            <Link href="/hrm/payroll" className="btn-outline">
              ← All runs
            </Link>
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Run totals">
        <div className="card p-4">
          <p className="text-xs text-muted">Total</p>
          <p className="mt-1 text-2xl font-bold">{formatPrice(run.totalCents)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Paid</p>
          <p className="mt-1 text-2xl font-bold text-primary">{formatPrice(run.paidCents)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Due</p>
          <p className={`mt-1 text-2xl font-bold ${run.dueCents > 0 ? "text-accent" : ""}`}>
            {formatPrice(run.dueCents)}
          </p>
        </div>
      </section>

      <RunActions runId={run.id} fullyPaid={run.status === "Paid"} />

      <section className="card overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Base</th>
              <th className="px-4 py-3">Adjustments</th>
              <th className="px-4 py-3">Net</th>
              <th className="px-4 py-3">Payment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {run.payslips.map((slip) => (
              <tr key={slip.id}>
                <td className="px-4 py-4">
                  <Link
                    href={`/hrm/employees/${slip.employee.id}`}
                    className="font-medium hover:text-primary"
                  >
                    {slip.employee.user.name}
                  </Link>
                  <p className="text-xs text-muted">
                    {slip.employee.employeeCode} · {slip.employee.designation}
                  </p>
                </td>
                <td className="px-4 py-4">{formatPrice(slip.baseSalaryCents)}</td>
                <td className="px-4 py-4">
                  <PayslipAdjustmentsForm
                    payslipId={slip.id}
                    allowancesCents={slip.allowancesCents}
                    deductionsCents={slip.deductionsCents}
                    note={slip.note ?? ""}
                    locked={Boolean(slip.paidAt)}
                  />
                </td>
                <td className="px-4 py-4 font-semibold">{formatPrice(slip.netCents)}</td>
                <td className="px-4 py-4">
                  {slip.paidAt ? (
                    <span className="text-xs text-primary">Paid</span>
                  ) : (
                    <PayslipPayButton payslipId={slip.id} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
