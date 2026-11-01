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

export async function StoreFooter() {
  const settings = await getStoreSettings();
  const categories = await getCategories();
  const year = await currentYear();
  const dict = await getDict();

  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="w-full grid  gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <StoreLogo
              logoUrl={settings.logoUrl}
              storeName={settings.storeName}
              className="h-7 w-7 text-xs"
            />
            {settings.storeName}
          </p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            {settings.address ?? dict.footer.tagline}
          </p>
          <div className="mt-4 space-y-1 text-sm text-muted">
            {settings.contactEmail && (
              <p className="flex items-center gap-1.5">
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
                >
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                {settings.contactEmail}
              </p>
            )}
            {settings.contactPhone && (
              <p className="flex items-center gap-1.5">
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
                >
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                {settings.contactPhone}
              </p>
            )}
          </div>
        </div>

        <div>
          <p className="mb-4 text-sm font-bold uppercase tracking-wider text-foreground">
            {dict.footer.shop}
          </p>
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

        <div>
          <p className="mb-4 text-sm font-bold uppercase tracking-wider text-foreground">
            {dict.footer.account}
          </p>
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

        <div>
          <p className="mb-4 text-sm font-bold uppercase tracking-wider text-foreground">
            {dict.footer.weAccept}
          </p>
          <div className="flex flex-wrap gap-2">
            {["bKash", "Nagad", "Card", PaymentMethods.COD].map((p) => (
              <span key={p} className="badge-muted border border-border/60 px-3 py-1">
                {p}
              </span>
            ))}
          </div>
          <div className="mt-5 flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-xs leading-relaxed text-muted">
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
              className="mt-0.5 shrink-0 text-primary"
            >
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            {dict.footer.secureNote}
          </div>
        </div>
      </div>

      <div className="border-t border-border py-5">
        <div className="flex w-full flex-col items-center justify-between gap-3 px-4 sm:flex-row">
          <p className="text-center text-xs text-muted">
            {fmt(dict.footer.rights, { year, store: settings.storeName })}
          </p>
          <nav className="flex items-center gap-4 text-xs text-muted">
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
