"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDict } from "@frontend/i18n/provider";
import { logoutAction } from "@backend/actions/auth";

export function AccountBreadcrumb() {
  const dict = useDict();

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted">
      <Link href="/" className="transition-colors hover:text-primary">
        {dict.account.home}
      </Link>
      <Chevron />
      <span className="font-medium text-foreground">{dict.account.accountCrumb}</span>
    </nav>
  );
}

function Chevron() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function AccountSidebar({
  user,
  balanceText,
  notifCount = 0,
  inboxUnread = 0,
  chatUnread = 0,
  cartCount = 0,
}: {
  user: { name: string; email: string };
  balanceText: string;
  notifCount?: number;
  inboxUnread?: number;
  chatUnread?: number;
  cartCount?: number;
}) {
  const dict = useDict();
  const pathname = usePathname();

  const items = [
    {
      href: "/account/inbox",
      label: dict.header.inbox,
      icon: <IconBell />,
      right: inboxUnread > 0 ? String(inboxUnread) : undefined,
      exact: false,
      dot: false,
    },
    {
      href: "/account/chat",
      label: dict.account.menuChat,
      icon: <IconChat />,
      right: chatUnread > 0 ? String(chatUnread) : undefined,
      exact: false,
      dot: false,
    },
    {
      href: "/account/wallet",
      label: dict.account.menuBalance,
      icon: <IconWallet />,
      right: balanceText,
      exact: false,
      dot: false,
    },
    {
      href: "/account/refer",
      label: dict.account.referTitle,
      icon: <IconGift />,
      right: undefined,
      exact: false,
      dot: false,
    },
    {
      href: "/account/products",
      label: dict.account.myProducts,
      icon: <IconBox />,
      right: undefined,
      exact: false,
      dot: false,
    },
    {
      href: "/account/orders",
      label: dict.account.myOrders,
      icon: <IconBag />,
      right: undefined,
      exact: false,
      dot: false,
    },
    {
      href: "/cart",
      label: dict.header.cart,
      icon: <IconCart />,
      right: cartCount > 0 ? String(cartCount) : undefined,
      exact: true,
      dot: false,
    },
    {
      href: "/account/notifications",
      label: dict.account.menuNotifications,
      icon: <IconBell />,
      right: undefined,
      exact: false,
      dot: notifCount > 0,
    },
    {
      href: "/account/wishlists",
      label: dict.account.wishlists,
      icon: <IconHeart />,
      right: undefined,
      exact: false,
      dot: false,
    },
    {
      href: "/account/suggest",
      label: dict.account.suggestTitle,
      icon: <IconBulb />,
      right: undefined,
      exact: false,
      dot: false,
    },
    {
      href: "/account/addresses",
      label: dict.account.menuAddresses,
      icon: <IconPin />,
      right: undefined,
      exact: false,
      dot: false,
    },
    {
      href: "/account/reviews",
      label: dict.account.menuReviews,
      icon: <IconStar />,
      right: undefined,
      exact: false,
      dot: false,
    },
    {
      href: "/account/rider-review",
      label: dict.account.riderTitle,
      icon: <IconTruck />,
      right: undefined,
      exact: false,
      dot: false,
    },
    {
      href: "/account/rate",
      label: dict.account.rateTitle,
      icon: <IconThumbs />,
      right: undefined,
      exact: false,
      dot: false,
    },
    {
      href: "/faq",
      label: dict.account.menuFaq,
      icon: <IconHelp />,
      right: undefined,
      exact: false,
      dot: false,
    },
    {
      href: "/blog",
      label: dict.account.menuBlog,
      icon: <IconDoc />,
      right: undefined,
      exact: false,
      dot: false,
    },
    {
      href: "/terms",
      label: dict.account.menuTerms,
      icon: <IconDoc />,
      right: undefined,
      exact: false,
      dot: false,
    },
    {
      href: "/privacy",
      label: dict.account.menuPrivacy,
      icon: <IconShield />,
      right: undefined,
      exact: false,
      dot: false,
    },
    {
      href: "/returns",
      label: dict.account.menuReturns,
      icon: <IconRefresh />,
      right: undefined,
      exact: false,
      dot: false,
    },
    {
      href: "/career",
      label: dict.account.menuCareer,
      icon: <IconBrief />,
      right: undefined,
      exact: false,
      dot: false,
    },
    {
      href: "/account/report",
      label: dict.account.menuReport,
      icon: <IconChart />,
      right: undefined,
      exact: false,
      dot: false,
    },
    {
      href: "/account",
      label: dict.account.menuProfile,
      icon: <IconUser />,
      right: undefined,
      exact: true,
      dot: false,
    },
  ];
  const navOrder = [
    "/account/wallet",
    "/account",
    "/account/orders",
    "/cart",
    "/account/addresses",
    "/account/wishlists",
    "/account/products",
    "/account/inbox",
    "/account/chat",
    "/account/notifications",
    "/account/refer",
    "/returns",
    "/account/reviews",
    "/account/rider-review",
    "/account/rate",
    "/account/suggest",
    "/account/report",
    "/faq",
    "/career",
    "/blog",
    "/terms",
    "/privacy",
  ];
  const orderedItems = [...items].sort(
    (first, second) => navOrder.indexOf(first.href) - navOrder.indexOf(second.href),
  );

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-light text-lg font-bold text-primary">
            {(user.name || user.email).charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
        </div>
      </div>

      <nav className="mt-3 space-y-2">
        {orderedItems.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                active
                  ? "border-primary/40 bg-primary-light text-primary"
                  : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary-light"
              }`}
            >
              <span className={active ? "text-primary" : "text-muted"}>{item.icon}</span>
              <span className="flex-1 truncate">{item.label}</span>
              {item.right && (
                <span
                  data-chat-unread={item.href === "/account/chat" ? item.right : undefined}
                  className="shrink-0 font-semibold text-primary"
                >
                  {item.right}
                </span>
              )}
              {item.dot && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />}
              <Chevron />
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => logoutAction()}
          className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-accent transition-colors hover:border-accent/40 hover:bg-accent/5"
        >
          <IconLogout />
          <span className="flex-1 text-left">{dict.account.menuLogout}</span>
        </button>
      </nav>
    </aside>
  );
}

function IconWallet() {
  return (
    <svg
      width="17"
      height="17"
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
function IconChat() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
function IconBag() {
  return (
    <svg
      width="17"
      height="17"
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
function IconCart() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}
function IconPin() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function IconBell() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
function IconStar() {
  return (
    <svg
      width="17"
      height="17"
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
function IconUser() {
  return (
    <svg
      width="17"
      height="17"
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
function IconLogout() {
  return (
    <svg
      width="17"
      height="17"
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
  );
}
function IconGift() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8" />
      <path d="M16.5 8a2.5 2.5 0 0 0 0-5C13 3 12 8 12 8" />
    </svg>
  );
}
function IconBox() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}
function IconHeart() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}
function IconBulb() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  );
}
function IconTruck() {
  return (
    <svg
      width="17"
      height="17"
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
function IconThumbs() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}
function IconHelp() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
}
function IconDoc() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" />
    </svg>
  );
}
function IconRefresh() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}
function IconBrief() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect x="2" y="6" width="20" height="14" rx="2" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M7 16v-5" />
      <path d="M12 16V8" />
      <path d="M17 16v-3" />
    </svg>
  );
}
