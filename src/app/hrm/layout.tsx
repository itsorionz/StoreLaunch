import { ThemeToggle } from "@frontend/components/layout/theme-provider";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@backend/lib/session";
import { isHrmRole } from "@backend/lib/access";
import { getSupportBadgeCounts } from "@backend/lib/support-dashboard";
import { Roles } from "@backend/lib/enums.mjs";
import { getUnreadCounts } from "@backend/lib/chat";
import { logoutAction } from "@backend/actions/auth";
import { ServiceNav, ServiceBottomNav } from "@frontend/components/service/service-nav";
import { AppSearch, AppSearchForm } from "@frontend/components/layout/app-search";
import { SearchContexts } from "@backend/lib/search-config.mjs";
import { RouteLoading } from "@frontend/components/ui/route-loading";
import { HrmAdminRedirect } from "@frontend/components/hrm/admin-redirect";

export const metadata = {
  title: "HRM",
};

export const viewport = {
  themeColor: "#0f7b4f",
  width: "device-width",
  initialScale: 1,
};

async function ServiceShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !isHrmRole(user.role)) redirect("/login?callbackUrl=/hrm");
  // Admins and SuperAdmins see HRM inside the admin layout via /admin/hrm/*
  const role = user.role as string;
  if (role === Roles.Admin || role === Roles.SuperAdmin) return <HrmAdminRedirect />;

  const [unread, badges] = await Promise.all([
    getUnreadCounts({ id: user.id, role: user.role }),
    getSupportBadgeCounts(),
  ]);
  const closedCount = badges.closedConversations;
  const ticketCount = badges.openTickets;
  const agentName = user.name || user.email || "Manager";

  const showSearch = user.role === Roles.Admin;

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-black text-white">
            {agentName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight tracking-tight">HRM</p>
            <p className="truncate text-[11px] leading-tight text-muted">{agentName}</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ServiceNav unread={unread} ticketCount={ticketCount} closedCount={closedCount} />
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center justify-between rounded-lg px-2 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">{agentName}</p>
              <p className="truncate text-[11px] text-muted">{user.email ?? ""}</p>
            </div>
            <ThemeToggle className="text-muted" />
          </div>
        </div>
        <form action={logoutAction} className="mt-1 px-2">
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/5"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" x2="9" y1="12" y2="12" />
            </svg>
            Logout
          </button>
        </form>
      </aside>

      <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-surface lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/hrm" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-black text-white">
              {agentName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight">HRM</p>
              <p className="truncate text-[11px] leading-tight text-muted">{agentName}</p>
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
          </div>
          <div className="flex items-center px-1">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="min-w-0 flex-1 pb-20 lg:pb-6 lg:pl-56">
        <div className="w-full px-4 pt-16 lg:px-6 lg:pt-8 xl:px-8">
          {showSearch && (
            <Suspense fallback={<AppSearchForm context={SearchContexts.admin} />}>
              <AppSearch context={SearchContexts.admin} />
            </Suspense>
          )}
          {children}
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface lg:hidden">
        <ServiceBottomNav />
      </div>
    </div>
  );
}

export default function HrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<RouteLoading className="min-h-screen bg-background" />}>
      <ServiceShell>{children}</ServiceShell>
    </Suspense>
  );
}
