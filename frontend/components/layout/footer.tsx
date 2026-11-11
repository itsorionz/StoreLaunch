import type { ReactNode } from "react";
import { PaymentMethods } from "@backend/lib/enums.mjs";
import Link from "next/link";
import { getStoreSettings } from "@backend/lib/settings";
import { getCategories } from "@backend/lib/catalog";
import { getDict, fmt } from "@frontend/i18n/dict";
import { StoreLogo } from "@frontend/components/layout/store-logo";

async function currentYear(): Promise<number> {
  "use cache";
  return new Date().getFullYear();
}

/** Column titles reuse the accent-bar motif from the homepage sections. */
function ColumnHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-4 flex items-center gap-2.5 text-sm font-bold uppercase tracking-wider text-foreground">
      <span className="h-4 w-1 rounded-full bg-primary" aria-hidden />
      {children}
    </h3>
  );
}

/** White chip carrying a brand-coloured icon tile for a payment method. */
function PaymentChip({ label, icon }: { label: string; icon: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background px-2.5 py-2 shadow-sm">
      <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden focusable="false">
        {icon}
      </svg>
      <span className="text-xs font-semibold leading-none text-foreground">{label}</span>
    </span>
  );
}

function ContactIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
    >
      {children}
    </svg>
  );
}

export async function StoreFooter() {
  const settings = await getStoreSettings();
  const categories = await getCategories();
  const year = await currentYear();
  const dict = await getDict();

  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="grid gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        {/* Brand & contact */}
        <div>
          <p className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <StoreLogo
              logoUrl={settings.logoUrl}
              storeName={settings.storeName}
              className="h-7 w-7 text-xs"
            />
            {settings.storeName}
          </p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">{dict.footer.tagline}</p>
          {settings.address && (
            <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-muted">
              <ContactIcon>
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </ContactIcon>
              {settings.address}
            </p>
          )}
          <div className="mt-4 space-y-1.5 text-sm text-muted">
            {settings.contactEmail && (
              <a
                href={`mailto:${settings.contactEmail}`}
                className="flex items-center gap-2 transition-colors hover:text-primary"
              >
                <ContactIcon>
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </ContactIcon>
                {settings.contactEmail}
              </a>
            )}
            {settings.contactPhone && (
              <a
                href={`tel:${settings.contactPhone.replace(/\s+/g, "")}`}
                className="flex items-center gap-2 transition-colors hover:text-primary"
              >
                <ContactIcon>
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </ContactIcon>
                {settings.contactPhone}
              </a>
            )}
          </div>
        </div>

        {/* Shop */}
        <div>
          <ColumnHeading>{dict.footer.shop}</ColumnHeading>
          <ul className="space-y-2.5 text-sm">
            {categories.slice(0, 6).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/categories/${c.slug}`}
                  className="text-muted transition-colors hover:text-primary"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Account */}
        <div>
          <ColumnHeading>{dict.footer.account}</ColumnHeading>
          <ul className="space-y-2.5 text-sm">
            <li>
              <Link href="/account" className="text-muted transition-colors hover:text-primary">
                {dict.footer.myAccount}
              </Link>
            </li>
            <li>
              <Link
                href="/account/orders"
                className="text-muted transition-colors hover:text-primary"
              >
                {dict.footer.orders}
              </Link>
            </li>
            <li>
              <Link href="/cart" className="text-muted transition-colors hover:text-primary">
                {dict.footer.cart}
              </Link>
            </li>
          </ul>
        </div>

        {/* We accept */}
        <div>
          <ColumnHeading>{dict.footer.weAccept}</ColumnHeading>
          <div className="flex flex-wrap gap-2">
            <PaymentChip
              label="bKash"
              icon={
                <>
                  <rect width="24" height="24" rx="7" fill="#E2136E" />
                  <text
                    x="12"
                    y="17"
                    textAnchor="middle"
                    fontFamily="Arial, sans-serif"
                    fontSize="14"
                    fontWeight="800"
                    fill="#ffffff"
                  >
                    b
                  </text>
                </>
              }
            />
            <PaymentChip
              label="Nagad"
              icon={
                <>
                  <defs>
                    <linearGradient id="footer-nagad" x1="0" y1="0" x2="1" y2="1">
                      <stop stopColor="#F79A1E" />
                      <stop offset="1" stopColor="#EE3124" />
                    </linearGradient>
                  </defs>
                  <rect width="24" height="24" rx="7" fill="url(#footer-nagad)" />
                  <text
                    x="12"
                    y="17"
                    textAnchor="middle"
                    fontFamily="Arial, sans-serif"
                    fontSize="14"
                    fontWeight="800"
                    fill="#ffffff"
                  >
                    N
                  </text>
                </>
              }
            />
            <PaymentChip
              label="Card"
              icon={
                <>
                  <rect width="24" height="24" rx="7" fill="#1E2A4A" />
                  <rect x="4" y="7" width="16" height="11" rx="2" fill="#ffffff" />
                  <rect x="4" y="9.6" width="16" height="2.4" fill="#1E2A4A" />
                  <rect
                    x="6.5"
                    y="14.4"
                    width="5.5"
                    height="1.8"
                    rx="0.9"
                    fill="#1E2A4A"
                    opacity="0.7"
                  />
                </>
              }
            />
            <PaymentChip
              label={PaymentMethods.COD}
              icon={
                <>
                  <rect width="24" height="24" rx="7" fill="#0F7B4F" />
                  <rect x="3.5" y="7.5" width="17" height="9" rx="1.8" fill="#ffffff" />
                  <circle cx="12" cy="12" r="2.7" fill="#0F7B4F" />
                  <circle cx="6.3" cy="12" r="1" fill="#0F7B4F" opacity="0.7" />
                  <circle cx="17.7" cy="12" r="1" fill="#0F7B4F" opacity="0.7" />
                </>
              }
            />
          </div>
          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary-light p-3 text-xs leading-relaxed text-muted">
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
              className="mt-0.5 h-4 w-4 shrink-0 text-primary"
            >
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>{dict.footer.secureNote}</span>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border bg-surface-2/60">
        <div className="flex w-full flex-col items-center justify-between gap-3 px-4 py-5 sm:flex-row">
          <p className="text-center text-xs text-muted">
            {fmt(dict.footer.rights, { year, store: settings.storeName })}
          </p>
          <nav
            aria-label="Legal"
            className="flex items-center gap-5 text-xs font-medium text-muted"
          >
            <Link href="/terms" className="transition-colors hover:text-primary">
              {dict.footer.terms}
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-primary">
              {dict.footer.privacy}
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
