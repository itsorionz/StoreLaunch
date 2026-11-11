import { AppSearch, AppSearchForm } from "@frontend/components/layout/app-search";
import { SearchContexts } from "@backend/lib/search-config.mjs";
import { Roles } from "@backend/lib/enums.mjs";
import { Suspense } from "react";
import { unstable_noStore } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@backend/lib/session";
import { getLicenseStatus } from "@backend/lib/owner-insights";
import { getStoreSettings } from "@backend/lib/settings";
import { AdminLogoutButton } from "@frontend/components/admin/admin-logout";
import { ThemeToggle } from "@frontend/components/layout/theme-provider";
import { AdminNav, AdminMobileBar } from "@frontend/components/admin/admin-nav";
import { StoreLogo } from "@frontend/components/layout/store-logo";
import { ConfirmProvider } from "@frontend/components/ui/confirm-dialog";
import { RouteLoading } from "@frontend/components/ui/route-loading";

function AdminProviders({ children }: { children: React.ReactNode }) {
  return <ConfirmProvider>{children}</ConfirmProvider>;
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  unstable_noStore();
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/admin");
  if (user.role !== Roles.Admin && user.role !== Roles.SuperAdmin) redirect("/");

  const isSuperAdmin = user.role === Roles.SuperAdmin;

  // SuperAdmin needs no license. Admin users require an active license to use /admin.
  if (!isSuperAdmin) {
    const license = await getLicenseStatus();
    if (license.state !== "active") redirect("/admin/license");
  }

  const settings = await getStoreSettings();

  return (
    <AdminProviders>
      <div className="flex min-h-screen bg-background">
        {/* Sidebar */}
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-surface text-foreground lg:flex print:hidden">
          <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
            <Link href="/" className="flex items-center gap-2.5">
              <StoreLogo
                logoUrl={settings.logoUrl}
                storeName={settings.storeName}
                className="h-7 w-7 text-xs"
              />
              <span className="text-sm font-bold tracking-tight">{settings.storeName}</span>
            </Link>
            <span className="badge ml-auto bg-surface-2 text-[10px] text-muted">
              {user.role === Roles.SuperAdmin ? "Super Admin" : "Admin"}
            </span>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <AdminNav isSuperAdmin={isSuperAdmin} />
          </nav>

          <div className="border-t border-border p-3">
            <div className="flex items-center justify-between rounded-lg px-2 py-1.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{user.name ?? user.email}</p>
                <p className="truncate text-[11px] text-muted">{user.email}</p>
              </div>
              <ThemeToggle className="text-muted" />
            </div>
            <div className="mt-1">
              <AdminLogoutButton />
            </div>
          </div>
        </aside>

        {/* Mobile bar */}
        <AdminMobileBar storeName={settings.storeName} logoUrl={settings.logoUrl} isSuperAdmin={isSuperAdmin} />

        {/* Content */}
        <main className="min-w-0 flex-1 lg:pl-60 print:pl-0">
          <div className="px-4 py-6 pt-16 lg:px-6 lg:py-6 lg:pt-6 xl:px-8 xl:py-8 xl:pt-8 print:p-0">
            <div className="print:hidden">
              <Suspense fallback={<AppSearchForm context={SearchContexts.admin} />}>
                <AppSearch context={SearchContexts.admin} />
              </Suspense>
            </div>
            {children}
          </div>
        </main>
      </div>
    </AdminProviders>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<RouteLoading className="min-h-screen bg-background" />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
