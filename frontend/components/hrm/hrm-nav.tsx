"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
  icon: React.ReactNode;
};

// The same six links the admin sidebar shows in its HRM group; /hrm is shared
// between Admin and Manager, so nothing here points back into /admin.
const items: NavItem[] = [
  { href: "/hrm", label: "Overview", exact: true, icon: <IconGrid /> },
  { href: "/hrm/employees", label: "Employees", icon: <IconUsers /> },
  { href: "/hrm/attendance", label: "Attendance", icon: <IconPulse /> },
  { href: "/hrm/leave", label: "Leave", icon: <IconCalendar /> },
  { href: "/hrm/payroll", label: "Payroll", icon: <IconWallet /> },
  { href: "/hrm/performance", label: "Performance", icon: <IconStar /> },
];

/** The most specific matching entry wins, so /hrm/employees stays highlighted. */
function useActiveHref(): string | undefined {
  const pathname = usePathname();
  return items
    .filter((item) => (item.exact ? pathname === item.href : pathname.startsWith(item.href)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export function HrmNav() {
  const activeHref = useActiveHref();
  return (
    <div>
      <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-muted">HRM</p>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = item.href === activeHref;
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
                {active && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function HrmBottomNav() {
  const activeHref = useActiveHref();
  return (
    <nav className="grid grid-cols-6">
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 px-0.5 py-2 text-[10px] font-semibold transition-colors ${
              active ? "text-primary" : "text-muted"
            }`}
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function IconGrid() {
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
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
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
function IconPulse() {
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
      <path d="M22 12h-4l-3 8-6-16-3 8H2" />
    </svg>
  );
}
function IconCalendar() {
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
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
function IconWallet() {
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
      <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
      <path d="M18 12h.01" />
    </svg>
  );
}
function IconStar() {
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
      <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
    </svg>
  );
}
