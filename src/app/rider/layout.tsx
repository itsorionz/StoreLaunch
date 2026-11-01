import { AppSearch, AppSearchForm } from "@frontend/components/layout/app-search";
import { SearchContexts } from "@backend/lib/search-config.mjs";
import { ThemeToggle } from "@frontend/components/layout/theme-provider";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getRider } from "@backend/lib/session";
import { logoutAction } from "@backend/actions/auth";
import { RiderNav, RiderBottomNav } from "@frontend/components/rider/rider-nav";

export const metadata = {
  title: "Deliveries",
  manifest: "/delivery-manifest.webmanifest",
  appleWebApp: { capable: true, title: "Deliveries", statusBarStyle: "default" },
};

export const viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
};

async function RiderShell({ children }: { children: React.ReactNode }) {
  const ctx = await getRider();
  if (!ctx) redirect("/login?callbackUrl=/rider");

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-black text-white">
            {ctx.rider.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight tracking-tight">Deliveries</p>
            <p className="truncate text-[11px] leading-tight text-muted">Rider</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <RiderNav />
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center justify-between rounded-lg px-2 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">{ctx.rider.name}</p>
              <p className="truncate text-[11px] text-muted">{ctx.rider.phone}</p>
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
          <Link href="/rider" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-black text-white">
              {ctx.rider.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight">My Deliveries</p>
              <p className="truncate text-[11px] leading-tight text-muted">{ctx.rider.name}</p>
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
        <div className="w-full px-4 pt-16 lg:px-6 lg:pt-8 xl:px-8">
          <Suspense fallback={<AppSearchForm context={SearchContexts.rider} />}>
            <AppSearch context={SearchContexts.rider} />
          </Suspense>
          {children}
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface lg:hidden">
        <RiderBottomNav />
      </div>
    </div>
  );
}

export default function RiderLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <RiderShell>{children}</RiderShell>
    </Suspense>
  );
}
