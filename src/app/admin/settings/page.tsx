import { getStoreSettings } from "@backend/lib/settings";
import { requireAdminPage } from "@backend/lib/session";
import { Roles } from "@backend/lib/enums.mjs";
import Link from "next/link";
import { SettingsForm } from "@frontend/components/admin/settings-form";
import { PageHeader } from "@frontend/components/admin/admin-ui";

export const metadata = { title: "Settings — Admin" };

export default async function AdminSettingsPage() {
  const user = await requireAdminPage();
  const isSuperAdmin = user.role === Roles.SuperAdmin;
  const settings = await getStoreSettings();

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Settings" subtitle="Store branding, currency and delivery" />
      {!isSuperAdmin && (
        <>
          <section className="card p-5 sm:p-6" aria-label="Instance and license">
            <h2 className="font-bold">Instance &amp; license</h2>
            <p className="mt-1 text-xs text-muted">
              This license gates the whole storefront — an expired or revoked license locks customer
              access.
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-border bg-surface-2 p-4">
                <dt className="text-xs text-muted">Status</dt>
                <dd className="mt-1 text-lg font-bold text-accent">Not activated</dd>
              </div>
              <div className="rounded-xl border border-border bg-surface-2 p-4">
                <dt className="text-xs text-muted">Expires</dt>
                <dd className="mt-1 text-lg font-bold">—</dd>
              </div>
              <div className="rounded-xl border border-border bg-surface-2 p-4">
                <dt className="text-xs text-muted">Activated</dt>
                <dd className="mt-1 text-lg font-bold">—</dd>
              </div>
              <div className="rounded-xl border border-border bg-surface-2 p-4">
                <dt className="text-xs text-muted">Bound store</dt>
                <dd className="mt-1 text-lg font-bold">—</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Manage your license key on the{" "}
              <Link href="/admin/license" className="font-semibold text-primary hover:underline">
                License page
              </Link>{" "}
              or renew by completing the setup flow with a new{" "}
              <code className="rounded bg-surface-2 px-1 py-0.5">SL1.…</code> key (license generation is
              a CLI operation — see{" "}
              <code className="rounded bg-surface-2 px-1 py-0.5">backend/scripts/license.ts</code>
              ).
            </p>
          </section>
        </>
      )}
      <SettingsForm settings={settings} />
    </div>
  );
}
