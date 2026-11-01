"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDict } from "@frontend/i18n/provider";

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
  icon: React.ReactNode;
  count?: number;
};

export function ServiceNav({
  unread = 0,
  ticketCount = 0,
  closedCount = 0,
}: {
  unread?: number;
  ticketCount?: number;
  closedCount?: number;
}) {
  const dict = useDict();
  const pathname = usePathname();
  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: dict.service.navWork,
      items: [
        {
          href: "/support",
          label: dict.service.overview,
          exact: true,
          icon: <IconDashboard />,
          count: unread,
        },
        {
          href: "/support/tickets",
          label: dict.service.tickets,
          icon: <IconTicket />,
          count: ticketCount,
        },
        {
          href: "/support/closed",
          label: dict.service.closed,
          icon: <IconArchive />,
          count: closedCount,
        },
      ],
    },
    {
      label: dict.service.navLookup,
      items: [
        { href: "/support/orders", label: dict.service.orders, icon: <IconBox /> },
        { href: "/support/customers", label: dict.service.customers, icon: <IconUsers /> },
      ],
    },
  ];
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-primary/15 font-semibold text-primary"
                        : "text-muted hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    <span className={active ? "text-primary" : "text-muted"}>{item.icon}</span>
                    {item.label}
                    {typeof item.count === "number" && item.count > 0 && (
                      <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">
                        {item.count}
                      </span>
                    )}
                    {typeof item.count === "number" && item.count === 0 && active && (
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

export function ServiceBottomNav() {
  const dict = useDict();
  const pathname = usePathname();
  const items: NavItem[] = [
    { href: "/support", label: dict.service.overview, exact: true, icon: <IconDashboard /> },
    { href: "/support/tickets", label: dict.service.tickets, icon: <IconTicket /> },
    { href: "/support/orders", label: dict.service.orders, icon: <IconBox /> },
    { href: "/support/closed", label: dict.service.closed, icon: <IconArchive /> },
  ];
  return (
    <nav className="grid grid-cols-4">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition-colors ${
              active ? "text-primary" : "text-muted"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function IconDashboard() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}
function IconTicket() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4V9z" />
      <path d="M13 7v10" strokeDasharray="2 3" />
    </svg>
  );
}
function IconArchive() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}
function IconBox() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
      <path d="M3 8l9 5 9-5" />
      <path d="M12 13v8" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg
      width="18"
      height="18"
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
