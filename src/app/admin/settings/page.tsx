import { getStoreSettings } from "@backend/lib/settings";
import { getLicenseStatus } from "@backend/lib/owner-insights";
import { requireAdminPage } from "@backend/lib/session";
import { SettingsForm } from "@frontend/components/admin/settings-form";
import { PageHeader } from "@frontend/components/admin/admin-ui";

export const metadata = { title: "Settings — Admin" };

const licenseStateLabel = {
  active: { label: "Active", tone: "text-primary" },
  expiring: { label: "Expiring soon", tone: "text-amber-600 dark:text-amber-400" },
  expired: { label: "Expired", tone: "text-accent" },
  revoked: { label: "Revoked", tone: "text-accent" },
  missing: { label: "Not activated", tone: "text-accent" },
} as const;

export default async function AdminSettingsPage() {
  await requireAdminPage();
  const [settings, license] = await Promise.all([getStoreSettings(), getLicenseStatus()]);
  const state = licenseStateLabel[license.state];

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Settings" subtitle="Store branding, currency and delivery" />
      <section className="card p-5 sm:p-6" aria-label="Instance and license">
        <h2 className="font-bold">Instance &amp; license</h2>
        <p className="mt-1 text-xs text-muted">
          This license gates the whole storefront — an expired or revoked license locks customer
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
                : license.state === "missing" || license.state === "revoked"
                  ? "—"
                  : "Never"}
            </dd>
            {license.daysToExpiry !== null && license.daysToExpiry > 0 && (
              <p className="mt-1 text-xs text-muted">{license.daysToExpiry} days left</p>
            )}
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
        <p className="mt-4 text-xs leading-relaxed text-muted">
          Renew or replace a license by completing the setup flow with a new{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5">SL1.…</code> key (license generation is
          a CLI operation — see{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5">backend/scripts/license.ts</code>
          ).
        </p>
      </section>
      <SettingsForm settings={settings} />
    </div>
  );
}
