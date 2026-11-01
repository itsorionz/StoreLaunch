"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/rider", label: "Deliveries", exact: true, icon: <IconTruck /> },
  { href: "/rider/route", label: "My route", exact: false, icon: <IconTruck /> },
  { href: "/rider/cash", label: "Cash", exact: false, icon: <IconWallet /> },
  { href: "/rider/help", label: "Help", exact: false, icon: <IconHelp /> },
  { href: "/rider/history", label: "History", exact: false, icon: <IconClock /> },
  { href: "/rider/profile", label: "Profile", exact: false, icon: <IconUser /> },
];

export function RiderNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
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
  );
}

export function RiderBottomNav() {
  const pathname = usePathname();
  return (
    <nav className="grid grid-cols-5">
      {items
        .filter((item) => item.href !== "/rider/help")
        .map((item) => {
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

function IconTruck() {
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
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M14 9h4l4 4v4a1 1 0 0 1-1 1h-1" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  );
}
function IconClock() {
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
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function IconUser() {
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
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
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
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="15" rx="2" />
      <path d="M16 12h5M3 9h18" />
    </svg>
  );
}
function IconHelp() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9 9a3 3 0 1 1 4 3c-1 .5-1 1-1 2M12 17h.01" />
    </svg>
  );
}
