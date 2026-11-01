import { Roles } from "@backend/lib/enums.mjs";
import { HeaderSearch, HeaderSearchForm } from "./header-search";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getStoreSettings } from "@backend/lib/settings";
import { getCategoryTree } from "@backend/lib/catalog";
import { getCurrentUser } from "@backend/lib/session";
import { db } from "@backend/lib/db";
import { getWalletBalance } from "@backend/lib/wallet";
import { formatPrice } from "@backend/lib/money";
import { getInboxUnreadCount } from "@backend/lib/inbox";
import { getCartCount } from "@backend/lib/cart";
import { listAddresses, shortAddress, DELIVERY_ADDR_COOKIE } from "@backend/lib/addresses";
import { getDict, fmt } from "@frontend/i18n/dict";
import { CartTrigger } from "@frontend/components/cart/cart-drawer";
import { ThemeToggle } from "@frontend/components/layout/theme-provider";
import { LangSwitcher } from "@frontend/components/layout/lang-switcher";
import { AnnouncementBar } from "@frontend/components/layout/announcement-bar";
import { DeliveryToTrigger } from "@frontend/components/layout/delivery-to-modal";

export async function StoreHeader() {
  // Session decoding uses random IVs; keep the header out of the prerender pass.
  await connection();
  const settings = await getStoreSettings();
  const tree = await getCategoryTree();
  const dict = await getDict();
  const user = await getCurrentUser();
  const addresses = user ? await listAddresses(user.id) : [];
  const selectedId = (await cookies()).get(DELIVERY_ADDR_COOKIE)?.value ?? null;
  const selected = addresses.find((a) => a.id === selectedId) ?? null;
  const deliveryLabel = selected
    ? shortAddress(selected)
    : settings.address || dict.header.nationwide;

  return (
    <>
      {/* The announcement scrolls away naturally; the store navigation stays pinned. */}
      <AnnouncementBar
        backgroundColor={settings.headerAnnouncementBackground}
        direction={settings.headerAnnouncementDirection}
        speed={settings.headerAnnouncementSpeed}
      >
        <span className="inline-flex items-center gap-1.5">
          <TruckIcon />
          {settings.headerAnnouncement ||
            fmt(dict.header.announcement, { eta: settings.deliveryEstimate })}
          {settings.contactPhone && (
            <span className="hidden opacity-75 sm:inline">
              ·{" "}
              {settings.headerSupportLabel
                ? `${settings.headerSupportLabel} ${settings.contactPhone}`
                : fmt(dict.header.support, { phone: settings.contactPhone })}
            </span>
          )}
        </span>
      </AnnouncementBar>

      {/* Main row */}
      <header className="sticky top-0 z-50 border-b border-border bg-surface">
        <div className="w-full flex  flex-wrap items-center justify-between gap-4 px-4 py-4 md:gap-12">
          {/* Left: logo + delivery location */}
          <div className="order-1 flex items-center gap-2 md:gap-8">
            <Link href="/" className="flex shrink-0 items-center gap-2.5">
              {settings.logoUrl ? (
                <Image
                  src={settings.logoUrl}
                  alt={settings.storeName}
                  width={130}
                  height={40}
                  unoptimized
                  className="h-10 w-auto"
                />
              ) : (
                <span className="flex items-center gap-2">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-base font-black text-white">
                    {settings.storeName.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-[17px] font-bold tracking-tight text-foreground">
                    {settings.storeName}
                  </span>
                </span>
              )}
            </Link>

            {/* Delivery To selector */}
            <div className="hidden items-center md:flex">
              <DeliveryToTrigger
                addresses={addresses}
                selectedId={selected?.id ?? null}
                buttonLabel={deliveryLabel}
                signedIn={!!user}
              />
            </div>
          </div>

          {/* Center: search — own row on mobile, second column on sm+ */}
          <Suspense
            fallback={
              <HeaderSearchForm
                search={dict.common.search}
                placeholder={dict.header.searchPlaceholder}
              />
            }
          >
            <HeaderSearch search={dict.common.search} placeholder={dict.header.searchPlaceholder} />
          </Suspense>

          {/* Right: icon buttons — icons at lg, labels at xl (Arogga-style) */}
          <div className="order-2 flex max-w-full items-center self-stretch gap-1 md:order-3">
            <Suspense fallback={<HeaderAccountSummary dict={dict} />}>
              <HeaderAccountActions dict={dict} currencySymbol={settings.currencySymbol} />
            </Suspense>

            <Suspense fallback={<CartTrigger label={dict.header.cart} horizontal href="/cart" />}>
              <CartWithBadge label={dict.header.cart} />
            </Suspense>

            <Suspense fallback={null}>
              <AdminLink label={dict.header.admin} />
            </Suspense>

            <span className="mx-1 hidden h-8 w-px bg-border sm:block" aria-hidden />

            <div className="flex items-center gap-0.5 px-1">
              <LangSwitcher />
              <ThemeToggle />
            </div>
          </div>
        </div>

        {/* Nav row — flash-sale style link left, categories center, underline on hover */}
        <div className="w-full flex  items-start gap-3 px-4 md:justify-between">
          <Link
            href="/offers"
            className="hidden shrink-0 items-center gap-2 pb-4 pt-3 text-sm font-medium text-foreground transition-colors hover:text-primary sm:flex md:w-52"
          >
            <span className="text-base">🔥</span>
            <span className="hidden md:inline">{dict.offers.title}</span>
          </Link>

          <nav aria-label="Primary categories" className="overflow-hidden">
            <ul className="flex w-full items-stretch gap-6 overflow-x-auto text-sm scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:justify-center md:gap-8">
              <li>
                <Link
                  href="/products"
                  className="relative flex items-center justify-center gap-2 whitespace-nowrap pb-4 pt-3 font-medium text-foreground transition-colors hover:text-primary after:absolute after:bottom-0 after:left-0 after:h-1 after:w-full after:rounded-t-[10px] after:bg-primary after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-200"
                >
                  {dict.header.allProducts}
                </Link>
              </li>
              <li>
                <Link
                  href="/offers"
                  className="flex whitespace-nowrap pb-4 pt-3 font-semibold text-primary"
                >
                  {dict.offers.title}
                </Link>
              </li>
              {tree.map((c) => (
                <li key={c.id} className="group relative">
                  <Link
                    href={`/categories/${c.slug}`}
                    className="relative flex items-center justify-center gap-2 whitespace-nowrap pb-4 pt-3 font-medium text-foreground transition-colors hover:text-primary after:absolute after:bottom-0 after:left-0 after:h-1 after:w-full after:rounded-t-[10px] after:bg-primary after:opacity-0 group-hover:after:opacity-100 after:transition-opacity after:duration-200"
                  >
                    {dict.lang === "bn" ? c.nameBn || c.name : c.name}
                    {c.children.length > 0 && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                        className="mt-0.5 opacity-50"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    )}
                  </Link>
                  {c.children.length > 0 && (
                    <div className="invisible absolute left-0 top-full z-50 min-w-48 rounded-xl border border-border bg-surface py-1.5 opacity-0 shadow-lg transition-all duration-150 group-hover:visible group-hover:opacity-100">
                      <Link
                        href={`/categories/${c.slug}`}
                        className="block px-4 py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-primary-light hover:text-primary"
                      >
                        {dict.lang === "bn" ? `${c.nameBn || c.name} সব` : `All ${c.name}`}
                      </Link>
                      {c.children.map((child) => (
                        <Link
                          key={child.id}
                          href={`/categories/${child.slug}`}
                          className="block px-4 py-1.5 text-sm text-muted transition-colors hover:bg-primary-light hover:text-primary"
                        >
                          {child.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          {/* Right spacer keeps nav optically centered like Arogga's md:w-55 slot */}
          <div className="hidden shrink-0 md:block md:w-52" aria-hidden />
        </div>
      </header>
    </>
  );
}

function HeaderIcon({
  label,
  icon,
  href,
  badge,
}: {
  label: string;
  icon: React.ReactNode;
  href: string;
  badge?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="relative flex flex-col items-center gap-0.5 self-stretch justify-end rounded-lg border border-transparent px-2 py-1 transition-colors hover:text-primary lg:px-3"
    >
      {icon}
      <span className="hidden text-xs font-medium leading-tight xl:block">{label}</span>
      {badge}
    </Link>
  );
}

function HeaderAccountSummary({
  dict,
  signedIn = false,
  balance = "",
  orders = 0,
  inbox = 0,
}: {
  dict: Awaited<ReturnType<typeof getDict>>;
  signedIn?: boolean;
  balance?: string;
  orders?: number;
  inbox?: number;
}) {
  return (
    <div
      className="flex items-center gap-1 sm:gap-4 lg:gap-5"
      data-header-account={signedIn ? "signed-in" : "guest"}
    >
      <HeaderSummaryLink
        href={signedIn ? "/account" : "/login"}
        label={dict.header.account}
        value={signedIn ? balance : dict.header.login}
        icon={<UserIcon />}
      />
      <HeaderSummaryLink
        href="/account/orders"
        label={dict.header.orders}
        value={String(orders)}
        icon={<OrdersIcon />}
      />
      <HeaderSummaryLink
        href="/account/inbox"
        label={dict.header.inbox}
        value={String(inbox)}
        icon={<InboxIcon />}
      />
    </div>
  );
}

function HeaderSummaryLink({
  href,
  label,
  value,
  icon,
}: {
  href: string;
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={`${label}: ${value}`}
      className="flex min-h-11 items-center gap-2 rounded-lg px-1 py-1 text-foreground transition-colors hover:text-primary [&>svg]:h-7 [&>svg]:w-7 [&>svg]:shrink-0 [&>svg]:stroke-[1.4]"
    >
      {icon}
      <span className="hidden min-w-0 whitespace-nowrap leading-tight sm:block">
        <span className="block text-xs font-normal">{label}</span>
        <span className="mt-0.5 block text-sm font-medium">{value}</span>
      </span>
    </Link>
  );
}

async function HeaderAccountActions({
  dict,
  currencySymbol,
}: {
  dict: Awaited<ReturnType<typeof getDict>>;
  currencySymbol: string;
}) {
  const user = await getCurrentUser();
  if (!user) return <HeaderAccountSummary dict={dict} />;
  const [balance, orders, inbox] = await Promise.all([
    getWalletBalance(user.id),
    db.order.count({ where: { userId: user.id } }),
    getInboxUnreadCount(user.id),
  ]);
  return (
    <HeaderAccountSummary
      dict={dict}
      signedIn
      balance={formatPrice(balance, currencySymbol)}
      orders={orders}
      inbox={inbox}
    />
  );
}

async function AdminLink({ label }: { label: string }) {
  const user = await getCurrentUser();
  if (!user || user.role !== Roles.Admin) return null;
  return <HeaderIcon label={label} icon={<ShieldIcon />} href="/admin" />;
}

async function CartWithBadge({ label }: { label: string }) {
  const [count, user] = await Promise.all([getCartCount(), getCurrentUser()]);
  return (
    <CartTrigger
      label={label}
      horizontal
      href={user ? undefined : "/login?callbackUrl=%2Fcart"}
      badge={
        <span className="pointer-events-none absolute left-6 top-0 bg-surface px-0.5 text-xs font-medium leading-none text-accent">
          {count > 99 ? "99+" : count}
        </span>
      }
    />
  );
}

function TruckIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      width="22"
      height="22"
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

function OrdersIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 2h12a2 2 0 0 1 2 2v18l-4-2-4 2-4-2-4 2V4a2 2 0 0 1 2-2Z" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M3 14h5l2 3h4l2-3h5" />
    </svg>
  );
}
