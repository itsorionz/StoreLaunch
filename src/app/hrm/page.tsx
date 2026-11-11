import Link from "next/link";
import { requireHrmPage } from "@backend/lib/session";

export const metadata = { title: "HRM Dashboard" };

export default async function HrmOverviewPage() {
  await requireHrmPage();

  return (
    <div className="animate-fade-up space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            HRM Operations
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">HRM overview</h1>
          <p className="mt-2 text-sm text-muted">
            Employee management, attendance, leave, payroll and performance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/hrm/employees" className="btn-primary">
            + New
          </Link>
        </div>
      </div>
    </div>
  );
}
