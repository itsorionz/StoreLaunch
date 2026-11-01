import Link from "next/link";
import { getDict } from "@frontend/i18n/dict";
import { cookies } from "next/headers";
import { listAddresses, DELIVERY_ADDR_COOKIE } from "@backend/lib/addresses";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCheckoutCart } from "@backend/lib/cart";
import { getCurrentUser } from "@backend/lib/session";
import { getStoreSettings } from "@backend/lib/settings";
import { getWalletBalance } from "@backend/lib/wallet";
import { formatPrice, effectivePriceCents } from "@backend/lib/money";
import { CheckoutForm } from "@frontend/components/checkout/checkout-form";
import { StoreLogo } from "@frontend/components/layout/store-logo";

export const metadata = { title: "Checkout" };

async function CheckoutContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/checkout");

  const [cart, settings, walletBalance, addresses, jar, dict] = await Promise.all([
    getCheckoutCart(),
    getStoreSettings(),
    getWalletBalance(user.id),
    listAddresses(user.id),
    cookies(),
    getDict(),
  ]);
  if (!cart || !cart.items.length) redirect("/cart");

  const address =
    addresses.find((entry) => entry.id === jar.get(DELIVERY_ADDR_COOKIE)?.value) ??
    addresses.find((entry) => entry.isDefault) ??
    addresses[0];
  const subtotal = cart.subtotalCents;
  const shipping =
    subtotal >= (settings.freeShippingOverCents ?? Infinity) ? 0 : settings.deliveryFeeCents;
  const total = subtotal + shipping;

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border pb-3">
        <Link href="/" className="flex min-w-0 items-center gap-2 font-bold text-primary">
          <StoreLogo
            logoUrl={settings.logoUrl}
            storeName={settings.storeName}
            className="h-8 w-8 text-sm"
          />
          <span className="hidden truncate sm:block">{settings.storeName}</span>
        </Link>
        <h1 className="text-xl font-bold">{dict.checkout.title}</h1>
        <Link href="/cart" className="text-xs font-semibold text-primary hover:underline">
          {dict.cart.viewCart}
        </Link>
      </div>
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
        <div className="min-h-0">
          <CheckoutForm
            address={address}
            userEmail={user.email ?? ""}
            walletBalanceCents={walletBalance}
            totalCents={total}
            currencySymbol={settings.currencySymbol}
          />
        </div>
        <aside className="card flex min-h-0 flex-col p-4">
          <h2 className="mb-3 font-bold">{dict.cart.orderSummary}</h2>
          <ul className="mb-3 max-h-64 min-h-0 space-y-3 overflow-y-auto lg:max-h-none lg:flex-1">
            {cart.items.map((i) => {
              const price = effectivePriceCents(i.product.priceCents, i.product.salePriceCents);
              return (
                <li key={i.id} className="flex justify-between gap-3 text-sm">
                  <span className="line-clamp-1 text-muted">
                    {i.product.name} × {i.quantity}
                  </span>
                  <span className="shrink-0 font-medium">
                    {formatPrice(price * i.quantity, settings.currencySymbol)}
                  </span>
                </li>
              );
            })}
          </ul>
          <dl className="space-y-2 border-t border-border pt-3 text-sm">
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
            {walletBalance > 0 && (
              <div className="flex justify-between text-primary">
                <dt>Wallet available</dt>
                <dd className="font-medium">
                  {formatPrice(walletBalance, settings.currencySymbol)}
                </dd>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
              <dt>Total</dt>
              <dd>{formatPrice(total, settings.currencySymbol)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[10px] leading-4 text-muted">
            Payment is processed securely by <strong>SSLCommerz (SSL Wireless)</strong> — cards,
            bKash, Nagad and more.
          </p>
        </aside>
      </div>
    </>
  );
}

export default function CheckoutPage() {
  return (
    <div
      data-checkout-page
      className="flex min-h-dvh w-full flex-col gap-3 px-4 py-3 lg:h-dvh lg:min-h-0"
    >
      <Suspense fallback={<div className="skeleton h-96 w-full rounded-2xl" />}>
        <CheckoutContent />
      </Suspense>
    </div>
  );
}
