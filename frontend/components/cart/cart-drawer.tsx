"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  getCartView,
  addToCart,
  selectCartItems,
  removeSelectedCartItems,
  removeCartItem,
  updateCartItem,
  type CartView,
} from "@backend/actions/cart";
import { AddressTypes } from "@backend/lib/enums.mjs";
import { selectDeliveryAddress } from "@backend/actions/account";
import { toggleStockNotification } from "@backend/actions/notify";
import { effectivePriceCents, discountPercent, formatPrice } from "@backend/lib/money";
import { useToast } from "@frontend/components/ui/toast";
import { useDict, useLang, fmt } from "@frontend/i18n/provider";

// Keep visibility through root layout refreshes (for example, address changes).
let drawerOpen = false;
const drawerListeners = new Set<() => void>();
function setDrawerOpen(open: boolean) {
  drawerOpen = open;
  drawerListeners.forEach((listener) => listener());
}
function subscribeDrawer(listener: () => void) {
  drawerListeners.add(listener);
  return () => {
    drawerListeners.delete(listener);
  };
}
const getDrawerSnapshot = () => drawerOpen;
const getServerDrawerSnapshot = () => false;

export function openCartDrawer() {
  window.dispatchEvent(new CustomEvent("cart:open"));
  setDrawerOpen(true);
}

export function CartTrigger({
  badge,
  label,
  className = "",
  horizontal = false,
  href,
}: {
  badge?: React.ReactNode;
  label: string;
  className?: string;
  horizontal?: boolean;
  href?: string;
}) {
  const triggerClass = `relative flex items-center rounded-lg border border-transparent px-2 py-1 transition-colors hover:text-primary ${horizontal ? "flex-row gap-2 self-center text-foreground [&>svg]:h-8 [&>svg]:w-8 [&>svg]:stroke-[1.3]" : "flex-col gap-0.5 self-stretch justify-end lg:px-3"} ${className}`;
  const content = (
    <>
      <CartIcon />
      <span
        className={
          horizontal
            ? "hidden text-sm font-semibold leading-tight sm:block"
            : "hidden text-xs font-medium leading-tight xl:block"
        }
      >
        {label}
      </span>
      {badge}
    </>
  );

  if (href) {
    return (
      <Link href={href} aria-label={label} className={triggerClass}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => openCartDrawer()}
      aria-label={label}
      className={triggerClass}
    >
      {content}
    </button>
  );
}

export function CartDrawer() {
  const dict = useDict();
  const lang = useLang();
  const toast = useToast();
  const router = useRouter();
  const open = useSyncExternalStore(subscribeDrawer, getDrawerSnapshot, getServerDrawerSnapshot);
  const [cart, setCart] = useState<CartView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addressPicker, setAddressPicker] = useState(false);
  const [pending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      setCart(await getCartView());
      setError(null);
    } catch {
      setError(dict.cart.loadFailed);
    } finally {
      setLoaded(true);
    }
  }, [dict.cart.loadFailed]);

  useEffect(() => {
    const onOpen = () => {
      const alreadyOpen = drawerOpen;
      setDrawerOpen(true);
      setLoaded(false);
      setAddressPicker(false);
      if (alreadyOpen) void refresh();
    };
    window.addEventListener("cart:open", onOpen);
    return () => window.removeEventListener("cart:open", onOpen);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getCartView()
      .then((view) => {
        if (!cancelled) {
          if (!view.signedIn) {
            setDrawerOpen(false);
            router.push("/login?callbackUrl=%2Fcart");
            return;
          }
          setCart(view);
          setError(null);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(dict.cart.loadFailed);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, dict.cart.loadFailed, router]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previousFocus?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (addressPicker) setAddressPicker(false);
        else setDrawerOpen(false);
      }
      if (event.key === "Tab") {
        const nodes = Array.from(
          panelRef.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled)",
          ) ?? [],
        ).filter((node) => node.getClientRects().length > 0 && !node.closest("[inert]"));
        const first = nodes[0],
          last = nodes.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === panelRef.current)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || document.activeElement === panelRef.current)
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, addressPicker]);

  useEffect(() => {
    if (addressPicker)
      panelRef.current
        ?.querySelector<HTMLButtonElement>("[data-cart-address-picker] button")
        ?.focus();
  }, [addressPicker]);

  function mutate(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error ?? dict.cart.updateFailed);
          return;
        }
        await refresh();
        router.refresh();
      } catch {
        setError(dict.cart.updateFailed);
      }
    });
  }

  const items = cart?.items ?? [];
  const availableItems = items.filter((item) => item.product.stock > 0);
  const unavailableItems = items.filter((item) => item.product.stock <= 0);
  const selected = availableItems.filter((item) => item.selected);
  const selectedCount = selected.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart?.subtotalCents ?? 0;
  const symbol = cart?.currencySymbol ?? "\u09f3";
  const freeOver = cart?.freeShippingOverCents ?? null;
  const shipping =
    !selected.length || (freeOver !== null && subtotal >= freeOver)
      ? 0
      : (cart?.deliveryFeeCents ?? 0);
  const saved = selected.reduce(
    (sum, item) =>
      sum +
      Math.max(
        0,
        item.product.priceCents -
          effectivePriceCents(item.product.priceCents, item.product.salePriceCents),
      ) *
        item.quantity,
    0,
  );
  const address = cart?.addresses.find((entry) => entry.id === cart.selectedAddressId);
  const typeLabel = (type: string) =>
    type === AddressTypes.HOME
      ? dict.account.typeHome
      : type === AddressTypes.OFFICE
        ? dict.account.typeOffice
        : dict.account.typeOther;
  const close = () => setDrawerOpen(false);

  return (
    <>
      <div
        aria-hidden
        onClick={close}
        className={`fixed inset-0 z-[90] bg-black/45 transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-hidden={!open}
        inert={!open}
        aria-label={dict.cart.drawerTitle}
        data-cart-drawer
        className={`fixed inset-y-0 right-0 z-[95] flex w-full max-w-[400px] flex-col bg-surface text-foreground shadow-2xl outline-none transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div inert={addressPicker} className="flex shrink-0 items-center justify-between px-4 py-4">
          <h2 className="text-sm font-bold">
            {dict.cart.drawerTitle} ({cart?.itemCount ?? 0})
          </h2>
          <button type="button" onClick={close} className="btn-icon" aria-label={dict.cart.close}>
            <CloseIcon />
          </button>
        </div>
        <div inert={addressPicker} className="shrink-0 border-b border-border px-4">
          <div className="flex w-1/2 flex-col items-center gap-1 border-b-[3px] border-primary pb-3 text-sm font-medium text-primary">
            <StoreIcon />
            {dict.cart.store} ({items.length})
          </div>
        </div>
        <div
          inert={addressPicker}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
        >
          {error && (
            <div role="alert" className="mb-3 rounded-lg bg-accent/10 p-3 text-sm text-accent">
              {error}
              <button
                type="button"
                onClick={() => void refresh()}
                className="ml-2 font-semibold underline"
              >
                {dict.cart.retry}
              </button>
            </div>
          )}
          {!loaded ? (
            <div className="space-y-3">
              {[0, 1, 2].map((key) => (
                <div key={key} className="skeleton h-28 rounded-xl" />
              ))}
            </div>
          ) : !items.length ? (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <CartIcon />
              <p className="mt-4 font-semibold">{dict.cart.empty}</p>
              <p className="mt-1 text-sm text-muted">{dict.cart.emptyHint}</p>
              <Link href="/products" onClick={close} className="btn-primary mt-4">
                {dict.cart.startShopping}
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between rounded-xl border border-border px-3 py-3 shadow-sm">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    aria-label={dict.cart.selectAll}
                    checked={availableItems.length > 0 && selected.length === availableItems.length}
                    disabled={pending || availableItems.length === 0}
                    onChange={(event) => mutate(() => selectCartItems(null, event.target.checked))}
                    className="h-5 w-5 rounded accent-[var(--primary)]"
                  />
                  {dict.cart.selectAll} ({selected.length}/{availableItems.length})
                </label>
                <div className="flex items-center gap-2">
                  <Link
                    href="/cart"
                    onClick={close}
                    aria-label={dict.cart.viewCart}
                    className="btn-icon text-muted"
                  >
                    <CartIcon />
                  </Link>
                  <button
                    type="button"
                    disabled={pending || !selected.length}
                    onClick={() => mutate(removeSelectedCartItems)}
                    aria-label={dict.cart.removeSelected}
                    title={dict.cart.removeSelected}
                    className="btn-icon text-muted hover:text-accent disabled:opacity-40"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
              {unavailableItems.length > 0 && (
                <h3 className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                  {fmt(dict.cart.unavailableItems, { n: unavailableItems.length })}
                </h3>
              )}
              <ul className="space-y-3">
                {[...unavailableItems, ...availableItems].map((item) => {
                  const itemName =
                    lang === "bn" ? item.product.nameBn || item.product.name : item.product.name;
                  const unavailable = item.product.stock <= 0;
                  const price = effectivePriceCents(
                    item.product.priceCents,
                    item.product.salePriceCents,
                  );
                  const off = discountPercent(item.product.priceCents, item.product.salePriceCents);
                  const maxQuantity = Math.min(99, item.product.stock);
                  return (
                    <li
                      key={item.id}
                      data-cart-item={item.id}
                      className="flex items-center gap-2.5 rounded-xl border border-border p-3 shadow-sm"
                    >
                      <input
                        type="checkbox"
                        checked={!unavailable && item.selected}
                        disabled={pending || unavailable}
                        onChange={(event) =>
                          mutate(() => selectCartItems([item.id], event.target.checked))
                        }
                        aria-label={fmt(dict.cart.selectItem, { name: itemName })}
                        className="h-5 w-5 shrink-0 rounded accent-[var(--primary)]"
                      />
                      <Link
                        href={`/products/${item.product.slug}`}
                        onClick={close}
                        className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-2"
                      >
                        <Image
                          src={item.product.images[0] ?? "/products/photo-spices.webp"}
                          alt={itemName}
                          fill
                          sizes="80px"
                          className="object-contain p-1"
                        />
                        {unavailable && (
                          <span className="absolute inset-x-0 bottom-0 bg-black/75 px-1 text-center text-[9px] font-semibold text-white">
                            {dict.cart.outOfStock}
                          </span>
                        )}
                        {off && (
                          <span className="absolute inset-x-0 top-0 bg-accent px-1 text-center text-[9px] font-bold text-white">
                            {fmt(dict.product.off, { n: off })}
                          </span>
                        )}
                      </Link>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-1">
                          <Link
                            href={`/products/${item.product.slug}`}
                            onClick={close}
                            className="line-clamp-2 min-w-0 flex-1 text-xs font-semibold leading-5 hover:text-primary"
                          >
                            {itemName}
                          </Link>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => mutate(() => removeCartItem(item.id))}
                            aria-label={`${dict.common.remove} ${itemName}`}
                            title={dict.common.remove}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted hover:bg-accent/10 hover:text-accent disabled:opacity-40"
                          >
                            <CloseIcon size={14} />
                          </button>
                        </div>
                        {item.product.brand && (
                          <p className="mt-0.5 truncate text-[10px] text-primary">
                            {lang === "bn"
                              ? item.product.brand.nameBn || item.product.brand.name
                              : item.product.brand.name}
                          </p>
                        )}
                        {!unavailable && (
                          <p className="mt-1 flex flex-wrap items-baseline justify-end gap-2 text-xs">
                            {off && (
                              <del className="text-[10px] text-muted">
                                {formatPrice(item.product.priceCents * item.quantity, symbol)}
                              </del>
                            )}
                            <span className="font-semibold">
                              {formatPrice(price * item.quantity, symbol)}
                            </span>
                          </p>
                        )}
                        {unavailable ? (
                          <div className="mt-2 flex justify-end">
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => mutate(() => toggleStockNotification(item.product.id))}
                              className="btn-outline btn-sm border-primary text-primary"
                            >
                              {cart?.notificationProductIds.includes(item.product.id)
                                ? dict.cart.notificationEnabled
                                : dict.cart.notifyWhenAvailable}
                            </button>
                          </div>
                        ) : (
                          <div className="mt-2 flex justify-end">
                            <div
                              role="group"
                              aria-label={`${dict.cart.quantity}: ${itemName}`}
                              className="flex items-center overflow-hidden rounded-md border border-primary text-xs font-semibold text-primary"
                            >
                              <button
                                type="button"
                                data-quantity-decrease
                                aria-label={`${dict.cart.decreaseQuantity}: ${itemName}`}
                                disabled={pending || item.quantity <= 1}
                                onClick={() =>
                                  mutate(() => updateCartItem(item.id, item.quantity - 1))
                                }
                                className="flex h-8 w-8 items-center justify-center text-lg hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                −
                              </button>
                              <span className="min-w-7 text-center tabular-nums" aria-live="polite">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                data-quantity-increase
                                aria-label={`${dict.cart.increaseQuantity}: ${itemName}`}
                                disabled={pending || item.quantity >= maxQuantity}
                                onClick={() =>
                                  mutate(() => updateCartItem(item.id, item.quantity + 1))
                                }
                                className="flex h-8 w-8 items-center justify-center text-lg hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <section className="mt-4 rounded-xl border border-border p-3 shadow-sm">
                <h3 className="text-sm font-bold">{dict.cart.deliverTo}</h3>
                {address ? (
                  <>
                    <p className="mt-3 text-xs text-muted">{typeLabel(address.type)}</p>
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{address.name}</p>
                        <p className="mt-1 text-xs text-muted">{address.phone}</p>
                        <p className="mt-1 break-words text-xs leading-4 text-muted">
                          {[
                            address.line1,
                            address.line2,
                            address.city,
                            address.region,
                            address.postal,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setAddressPicker(true)}
                        className="btn-outline btn-sm shrink-0"
                      >
                        {dict.cart.change}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="mt-3 space-y-3">
                    <p className="text-xs text-muted">
                      {cart?.signedIn ? dict.cart.noAddress : dict.cart.signInAddress}
                    </p>
                    <Link
                      href={
                        cart?.signedIn
                          ? "/account/addresses"
                          : "/login?callbackUrl=/account/addresses"
                      }
                      onClick={close}
                      className="btn-outline btn-sm"
                    >
                      {dict.cart.manageAddresses}
                    </Link>
                  </div>
                )}
              </section>
              {!!cart?.recommendations.length && (
                <section className="mt-4">
                  <h3 className="rounded-lg border border-border bg-surface-2 p-3 text-center text-sm font-semibold">
                    {dict.cart.recommendations}
                  </h3>
                  {cart.featuredCampaign && (
                    <p className="mt-1 text-center text-xs font-medium text-muted">
                      {cart.featuredCampaign.title}
                    </p>
                  )}
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {cart.recommendations.map((product) => (
                      <article
                        key={product.id}
                        className="w-32 shrink-0 rounded-lg border border-border p-2"
                      >
                        <Link href={`/products/${product.slug}`} onClick={close}>
                          <div className="relative mx-auto h-16 w-16">
                            <Image
                              src={product.images[0] ?? "/products/photo-spices.webp"}
                              alt={lang === "bn" ? product.nameBn || product.name : product.name}
                              fill
                              sizes="64px"
                              className="object-contain"
                            />
                          </div>
                          <p className="mt-1 line-clamp-2 h-8 text-[10px] font-medium">
                            {lang === "bn" ? product.nameBn || product.name : product.name}
                          </p>
                        </Link>
                        <p className="mt-1 text-xs font-semibold">
                          {formatPrice(
                            effectivePriceCents(product.priceCents, product.salePriceCents),
                            symbol,
                          )}
                        </p>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            mutate(async () => {
                              const result = await addToCart(product.id);
                              if (result.ok)
                                toast(dict.product.addedNotice, "success", {
                                  label: dict.cart.viewAll,
                                  onClick: openCartDrawer,
                                  dismissLabel: dict.cart.close,
                                });
                              return result;
                            })
                          }
                          className="mt-2 w-full rounded border border-primary py-1 text-xs font-semibold text-primary disabled:opacity-40"
                        >
                          {dict.product.add}
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              )}
              {cart?.flashSaleAvailable && (
                <Link
                  href={cart.featuredCampaign?.linkUrl ?? "/offers"}
                  onClick={close}
                  className="mt-4 flex items-center gap-3 rounded-xl border border-border px-4 py-3 shadow-sm"
                >
                  <span className="text-2xl text-amber-500" aria-hidden>
                    <svg width="22" height="26" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M13 2 3 14h8l-1 8L21 9h-8z" />
                    </svg>
                  </span>
                  <span className="text-sm font-black uppercase italic">{dict.cart.flashSale}</span>
                  <span className="flex-1 text-[10px] text-muted">
                    {cart.featuredCampaign?.title ?? dict.cart.flashSaleHint}
                  </span>
                  <span aria-hidden>{"\u203a"}</span>
                </Link>
              )}
            </>
          )}
        </div>
        {loaded && items.length > 0 && (
          <div
            inert={addressPicker}
            className="shrink-0 border-t border-border pb-[env(safe-area-inset-bottom)]"
          >
            {freeOver !== null && freeOver > 0 && selected.length > 0 && (
              <div
                className={`px-4 py-3 text-xs ${subtotal >= freeOver ? "bg-primary-light text-primary" : "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100"}`}
              >
                {subtotal >= freeOver ? (
                  dict.cart.freeDeliveryUnlocked
                ) : (
                  <>
                    {fmt(dict.cart.freeDeliveryAt, { amount: formatPrice(freeOver, symbol) })},{" "}
                    {fmt(dict.cart.freeDeliveryProgress, {
                      amount: formatPrice(freeOver - subtotal, symbol),
                    })}
                  </>
                )}
              </div>
            )}
            <div className="flex items-center justify-between gap-3 px-4 py-4">
              <div>
                <p className="text-sm">
                  <span className="font-semibold">{dict.cart.payable}:</span>{" "}
                  <strong data-cart-payable>{formatPrice(subtotal + shipping, symbol)}</strong>
                </p>
                {saved > 0 && (
                  <p className="mt-0.5 text-xs text-primary">
                    {dict.cart.saved}: {formatPrice(saved, symbol)}
                  </p>
                )}
                <p className="mt-0.5 text-[10px] text-muted">
                  {dict.cart.delivery}: {formatPrice(shipping, symbol)}
                </p>
              </div>
              <button
                type="button"
                disabled={!selected.length || pending}
                onClick={() => {
                  close();
                  router.push("/checkout");
                }}
                className="btn-primary px-5 py-3 disabled:opacity-40"
                data-cart-checkout
              >
                {dict.cart.checkout} ({selectedCount})
              </button>
            </div>
            {!selected.length && (
              <p role="status" className="px-4 pb-3 text-xs text-muted">
                {dict.cart.chooseItems}
              </p>
            )}
          </div>
        )}
        {addressPicker && (
          <div data-cart-address-picker className="absolute inset-0 z-10 flex flex-col bg-surface">
            <div className="flex items-center gap-3 border-b border-border p-4">
              <button
                type="button"
                onClick={() => setAddressPicker(false)}
                className="btn-outline btn-sm"
              >
                {dict.cart.back}
              </button>
              <h2 className="text-sm font-bold">{dict.cart.chooseAddress}</h2>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {error && (
                <p role="alert" className="text-sm text-accent">
                  {error}
                </p>
              )}
              {cart?.addresses.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  disabled={pending}
                  onClick={() => {
                    mutate(async () => {
                      const result = await selectDeliveryAddress(entry.id);
                      if (result.ok) setAddressPicker(false);
                      return result;
                    });
                  }}
                  className={`w-full rounded-xl border p-4 text-left ${entry.id === address?.id ? "border-primary bg-primary-light" : "border-border"}`}
                >
                  <p className="text-xs text-primary">{typeLabel(entry.type)}</p>
                  <p className="mt-1 text-sm font-semibold">{entry.name}</p>
                  <p className="mt-1 text-xs text-muted">{entry.phone}</p>
                  <p className="mt-1 text-xs text-muted">
                    {[entry.line1, entry.line2, entry.city].filter(Boolean).join(", ")}
                  </p>
                </button>
              ))}
              <Link href="/account/addresses" onClick={close} className="btn-outline w-full">
                {dict.cart.manageAddresses}
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function CloseIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
    </svg>
  );
}
function StoreIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M3 10l2-7h14l2 7M4 10v11h16V10M8 21v-7h8v7M3 10c0 3 4 3 4 0 0 3 5 3 5 0 0 3 5 3 5 0 0 3 4 3 4 0" />
    </svg>
  );
}

function CartIcon() {
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
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  );
}
