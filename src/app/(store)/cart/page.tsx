import { getDict } from "@frontend/i18n/dict";
import { Suspense } from "react";
import Link from "next/link";
import { getCart } from "@backend/lib/cart";
import { getStoreSettings } from "@backend/lib/settings";
import { formatPrice } from "@backend/lib/money";
import { CartItemList } from "@frontend/components/cart/cart-item-list";

export const metadata = { title: "Cart" };

async function CartContent() {
  const [cart, settings, dict] = await Promise.all([getCart(), getStoreSettings(), getDict()]);
  const items = cart?.items ?? [];
  const subtotal = cart?.subtotalCents ?? 0;
  const hasSelection = items.some((item) => item.selected);
  const shipping = !hasSelection
    ? 0
    : subtotal >= (settings.freeShippingOverCents ?? Infinity) && subtotal > 0
      ? 0
      : settings.deliveryFeeCents;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <CartItemList items={items} currencySymbol={settings.currencySymbol} />
      </div>
      {items.length > 0 && (
        <aside className="h-fit rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-4 font-bold">Order Summary</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="font-medium">{formatPrice(subtotal, settings.currencySymbol)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Delivery</dt>
              <dd className="font-medium">
                {shipping === 0 ? "Free" : formatPrice(shipping, settings.currencySymbol)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
              <dt>Total</dt>
              <dd>{formatPrice(subtotal + shipping, settings.currencySymbol)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted">{dict.cart.selectedSummary}</p>
          {hasSelection ? (
            <Link
              href="/checkout"
              className="mt-5 block rounded-lg bg-primary px-4 py-3 text-center text-sm font-bold text-white hover:bg-primary-dark"
            >
              Proceed to Checkout
            </Link>
          ) : (
            <p role="status" className="mt-4 text-sm text-muted">
              {dict.cart.chooseItems}
            </p>
          )}
        </aside>
      )}
    </div>
  );
}

export default function CartPage() {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <Link href="/" className="hover:text-primary">
          Home
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span aria-current="page" className="font-medium text-foreground">
          Cart
        </span>
      </nav>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="text-sm font-semibold text-primary">Your selections</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Shopping Cart</h1>
          <p className="mt-1 text-sm text-muted">
            Review quantities and selected items before checkout.
          </p>
        </div>
        <Link href="/products" className="btn-outline">
          Continue shopping
        </Link>
      </header>
      <Suspense
        fallback={
          <div className="grid gap-6 lg:grid-cols-3" aria-label="Loading cart">
            <div className="space-y-3 lg:col-span-2">
              <div className="h-28 animate-pulse rounded-2xl bg-surface-2" />
              <div className="h-28 animate-pulse rounded-2xl bg-surface-2" />
            </div>
            <div className="h-64 animate-pulse rounded-2xl bg-surface-2" />
          </div>
        }
      >
        <CartContent />
      </Suspense>
    </div>
  );
}
