"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeCartItem, updateCartItem, selectCartItems } from "@backend/actions/cart";
import { formatPrice, effectivePriceCents } from "@backend/lib/money";
import { useDict, useLang } from "@frontend/i18n/provider";
import { useToast } from "@frontend/components/ui/toast";

export type CartItemView = {
  id: string;
  quantity: number;
  selected: boolean;
  product: {
    id: string;
    name: string;
    nameBn?: string | null;
    slug: string;
    priceCents: number;
    salePriceCents: number | null;
    stock: number;
    images: string[];
  };
};

export function CartItemList({
  items,
  currencySymbol,
}: {
  items: CartItemView[];
  currencySymbol: string;
}) {
  const dict = useDict();
  const lang = useLang();
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!items.length) {
    return (
      <div className="card flex flex-col items-center px-6 py-16 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-muted">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="8" cy="21" r="1" />
            <circle cx="19" cy="21" r="1" />
            <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
          </svg>
        </div>
        <p className="text-lg font-semibold">{dict.cart.empty}</p>
        <p className="mt-1 text-sm text-muted">{dict.cart.emptyHint}</p>
        <Link href="/products" className="btn-primary mt-5">
          {dict.cart.startShopping}
        </Link>
      </div>
    );
  }

  function update(itemId: string, qty: number) {
    setErrors((e) => ({ ...e, [itemId]: "" }));
    setBusyId(itemId);
    startTransition(async () => {
      const res = await updateCartItem(itemId, qty);
      if (!res.ok) {
        const msg = res.error ?? dict.cart.updateFailed;
        setErrors((e) => ({ ...e, [itemId]: msg }));
        toast(msg, "error");
      }
      setBusyId(null);
      router.refresh();
    });
  }

  function remove(itemId: string) {
    setBusyId(itemId);
    startTransition(async () => {
      await removeCartItem(itemId);
      setBusyId(null);
      toast(dict.common.removedFromCart);
      router.refresh();
    });
  }

  function select(itemId: string, selected: boolean) {
    setBusyId(itemId);
    startTransition(async () => {
      try {
        const result = await selectCartItems([itemId], selected);
        if (!result.ok) toast(result.error ?? dict.cart.updateFailed, "error");
        router.refresh();
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const itemName =
          lang === "bn" ? item.product.nameBn || item.product.name : item.product.name;
        const price = effectivePriceCents(item.product.priceCents, item.product.salePriceCents);
        const busy = busyId === item.id;
        return (
          <li
            key={item.id}
            className={`card flex gap-4 p-4 transition-opacity ${busy ? "opacity-50" : ""}`}
          >
            <input
              type="checkbox"
              checked={item.selected}
              disabled={busyId !== null}
              onChange={(event) => select(item.id, event.target.checked)}
              aria-label={dict.cart.selectItem.replace("{name}", itemName)}
              className="mt-7 h-5 w-5 shrink-0 accent-[var(--primary)]"
            />
            <Link
              href={`/products/${item.product.slug}`}
              className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-surface-2"
            >
              <Image
                src={item.product.images[0] ?? "/products/photo-spices.webp"}
                alt={itemName}
                fill
                sizes="80px"
                className="object-contain p-1.5"
              />
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={`/products/${item.product.slug}`}
                className="line-clamp-2 text-sm font-medium leading-snug hover:text-primary"
              >
                {itemName}
              </Link>
              <p className="mt-1.5 text-base font-bold">{formatPrice(price, currencySymbol)}</p>
              {errors[item.id] && <p className="mt-1 text-xs text-accent">{errors[item.id]}</p>}
            </div>
            <div className="flex flex-col items-end justify-between">
              <button
                type="button"
                onClick={() => remove(item.id)}
                disabled={busy}
                aria-label={`${dict.common.remove} ${itemName}`}
                title={dict.common.remove}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-accent/10 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
              <div className="flex items-center rounded-lg border border-border text-sm">
                <button
                  type="button"
                  onClick={() => update(item.id, item.quantity - 1)}
                  disabled={busy}
                  className="px-2.5 py-1 text-muted transition-colors hover:text-foreground"
                  aria-label="Decrease"
                >
                  −
                </button>
                <span className="w-7 text-center font-semibold">{item.quantity}</span>
                <button
                  type="button"
                  onClick={() => update(item.id, Math.min(item.product.stock, item.quantity + 1))}
                  disabled={busy}
                  className="px-2.5 py-1 text-muted transition-colors hover:text-foreground"
                  aria-label="Increase"
                >
                  +
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
