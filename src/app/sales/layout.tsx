import { Suspense } from "react";
import { ThemeToggle } from "@frontend/components/layout/theme-provider";
import Link from "next/link";
import { requireSalesPage } from "@backend/lib/session";
import { logoutAction } from "@backend/actions/auth";
import { SalesNav, SalesBottomNav } from "@frontend/components/sales/sales-nav";

export const metadata = {
  title: "Sales",
  manifest: "/sales-manifest.webmanifest",
  appleWebApp: { capable: true, title: "Sales", statusBarStyle: "default" },
};

export const viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
};

async function SalesShell({ children }: { children: React.ReactNode }) {
  const user = await requireSalesPage();
  const displayName = user.name ?? "Sales rep";

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-black text-white">
            {displayName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight tracking-tight">Sales</p>
            <p className="truncate text-[11px] leading-tight text-muted">Point of sale</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <SalesNav />
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center justify-between rounded-lg px-2 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">{displayName}</p>
              <p className="truncate text-[11px] text-muted">{user.email ?? user.phone ?? ""}</p>
            </div>
            <ThemeToggle className="text-muted" />
          </div>
          <form action={logoutAction} className="mt-2 px-2">
            <button type="submit" className="text-sm font-semibold text-accent hover:underline">
              Logout
            </button>
          </form>
        </div>
      </aside>

      <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-surface lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/sales" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-black text-white">
              {displayName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight">Sales</p>
              <p className="truncate text-[11px] leading-tight text-muted">{displayName}</p>
            </div>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <form action={logoutAction} className="lg:hidden">
              <button
                type="submit"
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/5"
              >
                Logout
              </button>
            </form>
            <div className="flex items-center px-1">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="min-w-0 flex-1 pb-20 lg:pb-6 lg:pl-56">
        <div className="w-full px-4 pt-16 lg:px-6 lg:pt-8 xl:px-8">{children}</div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface lg:hidden">
        <SalesBottomNav />
      </div>
    </div>
  );
}

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <SalesShell>{children}</SalesShell>
    </Suspense>
  );
}
