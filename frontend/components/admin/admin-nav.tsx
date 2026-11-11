"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { StoreLogo } from "@frontend/components/layout/store-logo";

const groups: {
  label: string;
  items: { href: string; label: string; icon: React.ReactNode; exact?: boolean }[];
}[] = [
  {
    label: "Dashboard",
    items: [
      { href: "/admin", label: "Overview", exact: true, icon: <IconGrid /> },
      { href: "/admin/insights", label: "Growth insights", icon: <IconChart /> },
      { href: "/admin/activity", label: "Activity trail", icon: <IconPulse /> },
    ],
  },
  {
    label: "Sales & fulfillment",
    items: [
      { href: "/admin/orders", label: "Orders", icon: <IconBag /> },
      { href: "/admin/dispatch", label: "Dispatch", icon: <IconTruck /> },
      { href: "/admin/shipments", label: "Shipments", icon: <IconTruck /> },
      { href: "/admin/riders", label: "Delivery", icon: <IconTruck /> },
      { href: "/admin/returns", label: "Returns", icon: <IconBag /> },
    ],
  },
  {
    label: "Warehouse",
    items: [
      { href: "/admin/warehouse", label: "Locations", icon: <IconWarehouse /> },
      { href: "/admin/pick", label: "Pick queue", icon: <IconBox /> },
      { href: "/admin/pack", label: "Pack station", icon: <IconBox /> },
      { href: "/admin/warehouse/transfer", label: "Stock transfers", icon: <IconTruck /> },
      { href: "/admin/warehouse/rebalance", label: "Rebalance", icon: <IconChart /> },
      { href: "/admin/reorder", label: "Reorder report", icon: <IconBox /> },
      { href: "/admin/suppliers", label: "Suppliers", icon: <IconUsers /> },
      { href: "/admin/purchase-orders", label: "Purchase orders", icon: <IconBag /> },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: "/admin/products", label: "Products", icon: <IconBox /> },
      { href: "/admin/categories", label: "Categories", icon: <IconTag /> },
      { href: "/admin/brands", label: "Brands", icon: <IconAward /> },
    ],
  },
  {
    label: "Marketing",
    items: [
      { href: "/admin/carousel", label: "Carousel", icon: <IconImages /> },
      { href: "/admin/campaigns", label: "Campaigns", icon: <IconMega /> },
      { href: "/admin/promotions", label: "Promotions", icon: <IconMega /> },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/admin/margin", label: "Profitability", icon: <IconChart /> },
      { href: "/admin/reconciliation", label: "COD reconciliation", icon: <IconWallet /> },
      { href: "/admin/payments", label: "Payment recovery", icon: <IconWallet /> },
      { href: "/admin/wallets", label: "Wallets", icon: <IconWallet /> },
      { href: "/admin/commission", label: "Commissions", icon: <IconWallet /> },
    ],
  },
  {
    label: "People & support",
    items: [
      { href: "/admin/users", label: "Accounts", icon: <IconUsers /> },
      { href: "/admin/customers", label: "Customers", icon: <IconUsers /> },
      { href: "/admin/reviews", label: "Reviews", icon: <IconStar /> },
      { href: "/admin/feedback", label: "Feedback", icon: <IconStar /> },
      { href: "/admin/careers", label: "Careers", icon: <IconUsers /> },
    ],
  },
  {
    label: "HRM",
    items: [
      { href: "/admin/hrm", label: "Overview", exact: true, icon: <IconUsers /> },
      { href: "/admin/hrm/employees", label: "Employees", icon: <IconUsers /> },
      { href: "/admin/hrm/attendance", label: "Attendance", icon: <IconPulse /> },
      { href: "/admin/hrm/leave", label: "Leave", icon: <IconCalendar /> },
      { href: "/admin/hrm/payroll", label: "Payroll", icon: <IconWallet /> },
      { href: "/admin/hrm/performance", label: "Performance", icon: <IconStar /> },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/admin/sales", label: "Dashboard", exact: true, icon: <IconBag /> },
      { href: "/admin/sales/list", label: "Sales list", icon: <IconBag /> },
      { href: "/admin/sales/new", label: "New sale", icon: <IconPulse /> },
      { href: "/admin/sales/invoice", label: "Invoices", icon: <IconTag /> },
      { href: "/admin/sales/orders", label: "Orders", icon: <IconGrid /> },
    ],
  },
  {
    label: "Warehouse",
    items: [
      { href: "/admin/warehouse", label: "Dashboard", exact: true, icon: <IconWarehouse /> },
      { href: "/admin/warehouse/pick", label: "Pick queue", icon: <IconBox /> },
      { href: "/admin/warehouse/pack", label: "Pack station", icon: <IconBox /> },
      { href: "/admin/warehouse/receiving", label: "Receiving", icon: <IconTruck /> },
      { href: "/admin/warehouse/stock", label: "Stock", icon: <IconBox /> },
      { href: "/admin/warehouse/stocktake", label: "Stocktake", icon: <IconChart /> },
      { href: "/admin/warehouse/print", label: "Print slips", icon: <IconPrinter /> },
    ],
  },
  {
    label: "Support",
    items: [
      { href: "/admin/support", label: "Dashboard", exact: true, icon: <IconUsers /> },
      { href: "/admin/support/tickets", label: "Tickets", icon: <IconStar /> },
      { href: "/admin/support/tickets/new", label: "New ticket", icon: <IconPulse /> },
      { href: "/admin/support/closed", label: "Closed", icon: <IconCalendar /> },
      { href: "/admin/support/customers", label: "Customers", icon: <IconUsers /> },
      { href: "/admin/support/orders", label: "Orders", icon: <IconBag /> },
      { href: "/admin/support/search", label: "Search", icon: <IconMega /> },
      { href: "/admin/support/conversation", label: "Conversations", icon: <IconChat /> },
    ],
  },
  {
    label: "Store",
    items: [
      { href: "/admin/delivery-hubs", label: "Delivery hubs", icon: <IconWarehouse /> },
      { href: "/admin/delivery-zones", label: "Delivery zones", icon: <IconTag /> },
      { href: "/admin/settings", label: "Settings & license", icon: <IconGear /> },
    ],
  },
  {
    label: "License",
    items: [
      { href: "/admin/license", label: "License keys", icon: <IconKey /> },
    ],
  },
];

export function AdminNav({
  onNavigate,
  isSuperAdmin = false,
}: {
  onNavigate?: () => void;
  isSuperAdmin?: boolean;
}) {
  const pathname = usePathname();
  // The most specific matching entry wins, so /admin/warehouse does not stay
  // highlighted while the owner is on /admin/warehouse/transfer.
  const activeHref = groups
    .flatMap((group) => group.items)
    .filter((item) => (item.exact ? pathname === item.href : pathname.startsWith(item.href)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <div className="space-y-6">
      {groups
        .filter((g) => !(g.label === "License" && !isSuperAdmin))
        .map((g) => (
          <div key={g.label}>
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-muted">
              {g.label}
            </p>
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const active = item.href === activeHref;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-primary/15 font-semibold text-primary"
                          : "text-muted hover:bg-surface-2 hover:text-foreground"
                      }`}
                    >
                      <span className={active ? "text-primary" : "text-muted"}>{item.icon}</span>
                      {item.label}
                      {active && (
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
    </div>
  );
}

export function AdminMobileBar({
  storeName,
  logoUrl,
  isSuperAdmin = false,
}: {
  storeName: string;
  logoUrl: string | null;
  isSuperAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed inset-x-0 top-0 z-40 lg:hidden print:hidden">
      <div className="flex h-14 items-center justify-between border-b border-border bg-surface px-4">
        <Link href="/admin" className="flex items-center gap-2">
          <StoreLogo logoUrl={logoUrl} storeName={storeName} className="h-7 w-7 text-xs" />
          <span className="text-sm font-bold tracking-tight">Admin</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
          className="btn-icon text-muted hover:bg-surface-2"
        >
          {open ? (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>
      {open && (
        <div className="border-b border-border bg-surface p-3 shadow-lg">
          <AdminNav onNavigate={() => setOpen(false)} isSuperAdmin={isSuperAdmin} />
        </div>
      )}
    </div>
  );
}

function IconGrid() {
  return (
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
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </svg>
  );
}
function IconBag() {
  return (
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
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}
function IconUsers() {
  return (
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
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconBox() {
  return (
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
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}
function IconTag() {
  return (
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
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </svg>
  );
}
function IconMega() {
  return (
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
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}
function IconImages() {
  return (
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
      <rect width="18" height="14" x="3" y="5" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </svg>
  );
}
function IconStar() {
  return (
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
      <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
    </svg>
  );
}
function IconGear() {
  return (
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
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function IconAward() {
  return (
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
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  );
}
function IconWallet() {
  return (
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
      <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
      <path d="M18 12h.01" />
    </svg>
  );
}
function IconCalendar() {
  return (
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
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
function IconTruck() {
  return (
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
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M14 9h4l4 4v4a1 1 0 0 1-1 1h-1" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  );
}
function IconChart() {
  return (
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
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M7 15l4-5 3 3 4-6" />
    </svg>
  );
}
function IconPulse() {
  return (
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
      <path d="M22 12h-4l-3 8-6-16-3 8H2" />
    </svg>
  );
}
function IconKey() {
  return (
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
      <path d="M21 2l-2 6m7 6v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h6l6 6" />
      <path d="M17 11V9a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2z" />
    </svg>
  );
}
function IconWarehouse() {
  return (
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
      <path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z" />
      <path d="M6 18h12" />
      <path d="M6 14h12" />
      <rect width="12" height="12" x="6" y="10" />
    </svg>
  );
}
function IconPrinter() {
  return (
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
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect width="13" height="8" x="4" y="9" rx="1" />
    </svg>
  );
}
function IconChat() {
  return (
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
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
    </svg>
  );
}
