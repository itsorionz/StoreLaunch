"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useTransition } from "react";
import { addToCart } from "@backend/actions/cart";
import { formatPrice, discountPercent, effectivePriceCents } from "@backend/lib/money";
import { useDict, useLang, fmt } from "@frontend/i18n/provider";
import { openCartDrawer } from "@frontend/components/cart/cart-drawer";
import { useToast } from "@frontend/components/ui/toast";
import { Modal } from "@frontend/components/ui/modal";

export type ProductCardProps = {
  product: {
    id: string;
    name: string;
    nameBn?: string | null;
    slug: string;
    priceCents: number;
    salePriceCents: number | null;
    stock: number;
    images: string[];
    flashSale: boolean;
    featured: boolean;
    brand: { name: string; nameBn?: string | null; slug: string } | null;
    ratingAvg: number;
    ratingCount: number;
  };
  currencySymbol?: string;
  deliveryEstimate?: string;
};

export function ProductCard({
  product,
  currencySymbol = "৳",
  deliveryEstimate = "12-24 HOURS",
}: ProductCardProps) {
  const dict = useDict();
  const lang = useLang();
  const productName = lang === "bn" ? product.nameBn || product.name : product.name;
  const toast = useToast();
  const [added, setAdded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [pending, startTransition] = useTransition();

  const off = discountPercent(product.priceCents, product.salePriceCents);
  const price = effectivePriceCents(product.priceCents, product.salePriceCents);
  const image = product.images[0] ?? "/products/photo-spices.webp";
  const outOfStock = product.stock <= 0;
  const maxQty = Math.max(1, Math.min(99, product.stock));

  function openDialog(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (outOfStock) return;
    setQty(1);
    setDialogOpen(true);
  }

  function confirmAdd() {
    startTransition(async () => {
      const res = await addToCart(product.id, qty);
      if (res.ok) {
        setDialogOpen(false);
        setAdded(true);
        setTimeout(() => setAdded(false), 3000);
        toast(dict.product.addedNotice, "success", {
          label: dict.cart.viewAll,
          onClick: openCartDrawer,
          dismissLabel: dict.cart.close,
        });
      } else {
        toast(res.error ?? dict.product.couldNotAdd, "error");
      }
    });
  }

  return (
    <>
      <div className="product-card group relative flex min-w-0 shrink-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-surface shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
        <Link
          href={`/products/${product.slug}`}
          className="relative block aspect-square shrink-0 overflow-hidden bg-surface-2"
        >
          {off && (
            <span className="badge-accent absolute left-2 top-2 z-10 shadow-sm">
              {fmt(dict.product.off, { n: off })}
            </span>
          )}
          {product.featured && !off && (
            <span className="badge-accent absolute left-2 top-2 z-10 shadow-sm">
              {dict.product.new}
            </span>
          )}
          {product.flashSale && !off && !product.featured && (
            <span className="badge-accent absolute left-2 top-2 z-10 shadow-sm">
              {dict.product.flash}
            </span>
          )}
          <Image
            src={image}
            alt={productName}
            fill
            sizes="(max-width: 464px) calc((100vw - 48px) / 2), 208px"
            className="object-contain p-2 transition-transform duration-300 group-hover:scale-105"
          />
        </Link>

        <div className="flex h-44 shrink-0 flex-col gap-1 p-3">
          <div className="h-4 min-w-0 shrink-0">
            {product.brand && (
              <Link
                href={`/brands/${product.brand.slug}`}
                onClick={(e) => e.stopPropagation()}
                className="block truncate text-[11px] font-semibold text-primary/80 transition-colors hover:text-primary"
              >
                {lang === "bn" ? product.brand.nameBn || product.brand.name : product.brand.name}
              </Link>
            )}
          </div>
          <p className="flex h-4 shrink-0 items-center gap-1 overflow-hidden text-[11px] font-medium text-primary">
            <RocketIcon />
            <span className="truncate">{deliveryEstimate}</span>
          </p>
          <h3 className="line-clamp-2 h-9 shrink-0 text-[13px] font-medium leading-snug text-foreground">
            <Link href={`/products/${product.slug}`} className="line-clamp-2 hover:text-primary">
              {productName}
            </Link>
          </h3>
          <p className="h-4 shrink-0 truncate text-[11px] text-muted">
            {product.ratingCount > 0 && (
              <>
                <span className="text-amber-500">★</span> {product.ratingAvg} ({product.ratingCount}
                )
              </>
            )}
          </p>
          <div className="mt-auto flex items-baseline gap-1.5 pt-1">
            {off && (
              <span className="text-xs text-muted line-through">
                {formatPrice(product.priceCents, currencySymbol)}
              </span>
            )}
            <span className="text-sm font-bold text-foreground">
              {formatPrice(price, currencySymbol)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={openDialog}
          disabled={pending || outOfStock}
          aria-label={dict.product.addToCart}
          className={`absolute bottom-3 right-3 flex h-8 items-center justify-center gap-1 whitespace-nowrap rounded-full px-3.5 text-xs font-semibold text-white shadow-md transition-all duration-200 hover:scale-105 hover:bg-primary-dark group-hover:opacity-100 disabled:opacity-40 max-sm:opacity-100 ${
            added ? "bg-green-600 opacity-100" : "bg-primary opacity-0"
          }`}
        >
          {outOfStock ? (
            <span className="text-[9px] font-black">Stock Out</span>
          ) : pending ? (
            "…"
          ) : added ? (
            dict.product.added
          ) : (
            dict.product.add
          )}
        </button>
      </div>

      <Modal open={dialogOpen} onClose={() => setDialogOpen(false)} title={dict.product.addToCart}>
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface-2 p-3">
            <Image
              src={image}
              alt={productName}
              width={56}
              height={56}
              className="h-14 w-14 shrink-0 rounded-lg bg-surface object-contain p-1"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{productName}</p>
              <p className="mt-0.5 text-sm font-bold text-primary">
                {formatPrice(price, currencySymbol)}
                {off && (
                  <span className="ml-1.5 text-xs font-normal text-muted line-through">
                    {formatPrice(product.priceCents, currencySymbol)}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{dict.product.qty}</span>
            <div className="flex h-10 items-center rounded-lg border border-border bg-surface">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="flex h-full w-10 items-center justify-center text-lg text-muted transition-colors hover:text-foreground"
                aria-label="Decrease quantity"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                max={maxQty}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Math.min(maxQty, Number(e.target.value) || 1)))}
                className="w-12 border-0 bg-transparent text-center text-sm font-bold outline-none"
                aria-label={dict.product.qty}
                placeholder={dict.product.qty}
              />
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                className="flex h-full w-10 items-center justify-center text-lg text-muted transition-colors hover:text-foreground"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          </div>

          <p className="text-xs text-muted">
            {outOfStock
              ? "Stock out"
              : `${dict.product.inStock} · ${fmt(dict.product.onlyLeft, { n: product.stock })}`}
          </p>

          <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
            <span className="font-medium">{dict.cart.total}</span>
            <span className="text-base font-bold">{formatPrice(price * qty, currencySymbol)}</span>
          </div>

          <button
            type="button"
            onClick={confirmAdd}
            disabled={pending}
            className="btn-primary btn-lg w-full"
          >
            {pending ? "…" : dict.product.addToCart}
          </button>
        </div>
      </Modal>
    </>
  );
}

function RocketIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}
