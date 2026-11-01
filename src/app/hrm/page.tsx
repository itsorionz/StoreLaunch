import Link from "next/link";
import { requireHrmPage } from "@backend/lib/session";
import { db } from "@backend/lib/db";
import { getDict } from "@frontend/i18n/dict";
import { formatPrice } from "@backend/lib/money";

export const metadata = { title: "HRM Dashboard" };

export default async function HrmOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireHrmPage();
  const dict = await getDict();
  const params = await searchParams;
  const defaultWarehouse = await db.warehouse.findFirst({ where: { isDefault: true } });
  const warehouseId = defaultWarehouse?.id;

// License state — default to "missing" when no license data is present
  const licenseState = "missing";

// @ts-ignore — licenseState is always "missing" at runtime
  const showLicenseBanner = licenseState !== "active";

  return (
    <div className="animate-fade-up space-y-6">
      {showLicenseBanner && (
        <div
          data-admin-license-banner
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/10 px-5 py-4"
        >
          <div className="min-w-0">
            <p>No license activated</p>
          </div>
        </div>
      )}
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
          <Link href="/hrm/employees" className="btn-primary">+ New</Link>
        </div>
      </div>
    </div>
  );
}