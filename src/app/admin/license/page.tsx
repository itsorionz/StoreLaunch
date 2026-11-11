import { getLicenseStatus } from "@backend/lib/owner-insights";
import { requireAdminPage } from "@backend/lib/session";
import { PageHeader } from "@frontend/components/admin/admin-ui";
import { LicenseForm } from "./license-form";
import { IssueLicenseForm } from "./issue-license-form";
import { IssuedLicensesList } from "./issued-licenses-list";
import { LicenseStats } from "./license-stats";
import { Roles } from "@backend/lib/enums.mjs";

const licenseStateLabel = {
  active: { label: "Active", tone: "text-primary" },
  expiring: { label: "Expiring soon", tone: "text-amber-600 dark:text-amber-400" },
  expired: { label: "Expired", tone: "text-accent" },
  revoked: { label: "Revoked", tone: "text-accent" },
  missing: { label: "Not activated", tone: "text-accent" },
} as const;

export const metadata = { title: "License — Admin" };

export default async function AdminLicensePage() {
  const user = await requireAdminPage();
  const license = await getLicenseStatus();
  const state = licenseStateLabel[license.state];
  const isSuperAdmin = user.role === Roles.SuperAdmin;

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="License" subtitle="Issue and activate license keys" />
      {!isSuperAdmin && (
        <section className="card p-5 sm:p-6" aria-label="Current license">
        <h2 className="font-bold">Current license</h2>
        <p className="mt-1 text-xs text-muted">
          The license key gates the whole storefront. An expired or revoked license locks customer
          access.
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <dt className="text-xs text-muted">Status</dt>
            <dd className={`mt-1 text-lg font-bold ${state.tone}`}>{state.label}</dd>
          </div>
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <dt className="text-xs text-muted">Expires</dt>
            <dd className="mt-1 text-lg font-bold">
              {license.expiresAt
                ? license.expiresAt.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })
                : "—"}
            </dd>
          </div>
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <dt className="text-xs text-muted">Activated</dt>
            <dd className="mt-1 text-lg font-bold">
              {license.activatedAt
                ? license.activatedAt.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })
                : "—"}
            </dd>
          </div>
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <dt className="text-xs text-muted">Bound store</dt>
            <dd className="mt-1 text-lg font-bold">{license.storeSlug ?? "—"}</dd>
          </div>
          </dl>
        </section>
      )}
      {isSuperAdmin ? (
        <div className="space-y-8">
          <LicenseStats />
          <IssueLicenseForm />
          <IssuedLicensesList />
        </div>
      ) : (
        <div>
          <LicenseForm />
          {license.state !== "active" && (
            <section className="card p-5 sm:p-6 border border-accent/40 bg-accent/10">
              <h2 className="font-bold text-accent">License required</h2>
              <p className="mt-1 text-xs text-accent">
                This instance has no active license. Please ask your Super Admin to issue a key
                for you.
              </p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
