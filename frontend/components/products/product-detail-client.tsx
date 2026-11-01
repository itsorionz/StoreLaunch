"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addToCart } from "@backend/actions/cart";
import { formatPrice, discountPercent, effectivePriceCents } from "@backend/lib/money";
import { useDict, useLang, fmt } from "@frontend/i18n/provider";
import { openCartDrawer } from "@frontend/components/cart/cart-drawer";
import { useToast } from "@frontend/components/ui/toast";
import { NotifyMeButton } from "@frontend/components/products/notify-me-button";
import { WishlistButton } from "@frontend/components/account/wishlist-button";

type DetailProduct = {
  id: string;
  name: string;
  nameBn?: string | null;
  slug: string;
  priceCents: number;
  salePriceCents: number | null;
  stock: number;
  images: string[];
  flashSale: boolean;
  description: string;
  descriptionBn?: string | null;
  brand: { name: string; nameBn?: string | null; slug: string } | null;
  ratingAvg: number;
  ratingCount: number;
  category: {
    name: string;
    nameBn?: string | null;
    slug: string;
    parent: { name: string; nameBn?: string | null; slug: string } | null;
  };
  reviews: { id: string; rating: number; body: string; createdAt: Date; user: { name: string } }[];
};

/** Manual zoom levels for the +/- controls; 1 = fit. */
const ZOOM_STEPS = [1, 1.5, 2, 3];
/** Magnification used by the mouse hover preview when not manually zoomed. */
const HOVER_SCALE = 2.75;

export function ProductDetailClient({
  product,
  settings,
  notify,
  wishlisted = false,
}: {
  product: DetailProduct;
  settings: { currencySymbol: string; deliveryEstimate: string };
  notify?: { enabled: boolean; loggedIn: boolean };
  wishlisted?: boolean;
}) {
  const dict = useDict();
  const lang = useLang();
  const productName = lang === "bn" ? product.nameBn || product.name : product.name;
  const productDescription =
    lang === "bn" ? product.descriptionBn || product.description : product.description;
  const router = useRouter();
  const toast = useToast();
  const [imageIndex, setImageIndex] = useState(0);
  const [qty, setQty] = useState(1);
  const [pending, startTransition] = useTransition();
  // Photo zoom: a hover magnifier for mouse pointers, plus explicit +/−
  // controls that also work on touch — where dragging a finger pans the
  // zoomed photo. The hint pill is CSS-gated to hover-capable devices.
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [scale, setScale] = useState(1);

  function trackZoom(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setZoom({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  }

  function setZoomStep(delta: 1 | -1) {
    const current = ZOOM_STEPS.indexOf(scale);
    const next =
      ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, (current < 0 ? 0 : current) + delta))];
    setScale(next);
    if (next === 1) setZoom(null);
    // Anchor at the centre until the pointer/finger provides a focus point.
    else setZoom((z) => z ?? { x: 50, y: 50 });
  }

  const off = discountPercent(product.priceCents, product.salePriceCents);
  const price = effectivePriceCents(product.priceCents, product.salePriceCents);
  const outOfStock = product.stock <= 0;
  const images = product.images.length ? product.images : ["/products/photo-spices.webp"];

  function add() {
    startTransition(async () => {
      const res = await addToCart(product.id, qty);
      if (res.ok) {
        toast(dict.product.addedNotice, "success", {
          label: dict.cart.viewAll,
          onClick: openCartDrawer,
          dismissLabel: dict.cart.close,
        });
      } else toast(res.error ?? dict.product.couldNotAdd, "error");
    });
  }

  function buyNow() {
    startTransition(async () => {
      const res = await addToCart(product.id, qty);
      if (res.ok) {
        toast(dict.product.addedNotice, "success", {
          label: dict.cart.viewAll,
          onClick: openCartDrawer,
          dismissLabel: dict.cart.close,
        });
        router.push("/checkout");
      } else toast(res.error ?? dict.product.couldNotAdd, "error");
    });
  }

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      {/* Gallery — capped at half the viewport height so image + thumbs + CTA
          stay above the fold on desktop without scrolling. */}
      <div className="mx-auto w-full max-w-[min(100%,50vh)] lg:sticky lg:top-40 lg:self-start">
        <div
          className="relative aspect-square cursor-zoom-in select-none overflow-hidden rounded-2xl border border-border/60 bg-surface"
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") trackZoom(e);
          }}
          onPointerMove={(e) => {
            // Mice always follow the cursor (hover preview or panning while
            // manually zoomed); touch/pen only pan while actually zoomed in.
            if (e.pointerType === "mouse" || scale > 1) trackZoom(e);
          }}
          onPointerLeave={() => {
            // Manual zoom persists after the pointer leaves; the hover
            // preview (scale 1) ends as soon as the mouse exits.
            if (scale === 1) setZoom(null);
          }}
        >
          {off && (
            <span className="badge-accent absolute left-4 top-4 z-10 shadow-sm">
              {fmt(dict.product.off, { n: off })}
            </span>
          )}
          <div className="absolute right-4 top-4 z-10">
            <WishlistButton productId={product.id} initial={wishlisted} />
          </div>
          <Image
            src={images[imageIndex]}
            alt={productName}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-contain p-8"
          />
          {zoom && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-[5]"
              style={{
                transform: `scale(${scale > 1 ? scale : HOVER_SCALE})`,
                transformOrigin: `${zoom.x}% ${zoom.y}%`,
              }}
            >
              <Image
                src={images[imageIndex]}
                alt=""
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-contain p-8"
              />
            </div>
          )}
          <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-surface/85 p-1 shadow-md">
            <button
              type="button"
              onClick={() => setZoomStep(-1)}
              disabled={scale <= ZOOM_STEPS[0]}
              aria-label="Zoom out"
              className="flex h-7 w-7 items-center justify-center rounded-full text-base font-bold leading-none text-foreground transition hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              −
            </button>
            <span className="min-w-9 text-center text-xs font-bold tabular-nums text-foreground">
              {scale}×
            </span>
            <button
              type="button"
              onClick={() => setZoomStep(1)}
              disabled={scale >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
              aria-label="Zoom in"
              className="flex h-7 w-7 items-center justify-center rounded-full text-base font-bold leading-none text-foreground transition hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              +
            </button>
          </div>
          {!zoom && (
            <span className="absolute bottom-3 left-3 z-10 hidden items-center gap-1.5 rounded-full bg-surface/85 px-2.5 py-1 text-xs font-semibold text-foreground shadow [@media(hover:hover)_and_(pointer:fine)]:flex">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              {dict.product.zoomHint}
            </span>
          )}
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setImageIndex((i) => (i - 1 + images.length) % images.length)}
                aria-label="Previous photo"
                className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface/85 text-foreground shadow-md transition hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setImageIndex((i) => (i + 1) % images.length)}
                aria-label="Next photo"
                className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface/85 text-foreground shadow-md transition hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              <span className="absolute bottom-3 right-3 z-10 rounded-full bg-surface/85 px-2.5 py-1 text-xs font-bold text-foreground shadow">
                {imageIndex + 1} / {images.length}
              </span>
            </>
          )}
        </div>
        {images.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Product photos">
            {images.map((img, i) => (
              <button
                key={img + i}
                type="button"
                role="tab"
                aria-selected={i === imageIndex}
                aria-label={`Photo ${i + 1} of ${images.length}`}
                onClick={() => setImageIndex(i)}
                className={`relative h-16 w-16 overflow-hidden rounded-lg border-2 transition-colors ${
                  i === imageIndex
                    ? "border-primary"
                    : "border-border hover:border-muted focus-visible:border-primary"
                }`}
              >
                <Image src={img} alt="" fill sizes="64px" className="object-contain p-1" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div>
        {/* Breadcrumb */}
        <nav
          className="mb-3 flex flex-wrap items-center gap-1.5 text-sm text-muted"
          aria-label="Breadcrumb"
        >
          <Link href="/" className="transition-colors hover:text-primary">
            Home
          </Link>
          <span aria-hidden>/</span>
          <Link
            href={`/categories/${product.category.slug}`}
            className="transition-colors hover:text-primary"
          >
            {lang === "bn"
              ? product.category.nameBn || product.category.name
              : product.category.name}
          </Link>
          {product.category.parent && (
            <>
              <span aria-hidden>/</span>
              <Link
                href={`/categories/${product.category.parent.slug}`}
                className="transition-colors hover:text-primary"
              >
                {lang === "bn"
                  ? product.category.parent.nameBn || product.category.parent.name
                  : product.category.parent.name}
              </Link>
            </>
          )}
          {product.brand && (
            <>
              <span aria-hidden>/</span>
              <Link
                href={`/brands/${product.brand.slug}`}
                className="transition-colors hover:text-primary"
              >
                {lang === "bn" ? product.brand.nameBn || product.brand.name : product.brand.name}
              </Link>
            </>
          )}
        </nav>

        <div className="flex items-center gap-2">
          {product.brand && (
            <Link
              href={`/brands/${product.brand.slug}`}
              className="badge-primary transition-opacity hover:opacity-80"
            >
              {lang === "bn" ? product.brand.nameBn || product.brand.name : product.brand.name}
            </Link>
          )}
          <span className="badge-muted">
            {lang === "bn"
              ? product.category.nameBn || product.category.name
              : product.category.name}
          </span>
        </div>
        <h1 className="mt-3 text-2xl font-bold leading-snug tracking-tight lg:text-3xl">
          {productName}
        </h1>

        {product.ratingCount > 0 && (
          <p className="mt-2.5 flex items-center gap-1.5 text-sm text-muted">
            <span className="text-amber-500">★</span>
            <span className="font-semibold text-foreground">{product.ratingAvg}</span>·{" "}
            {product.ratingCount} review{product.ratingCount === 1 ? "" : "s"}
          </p>
        )}

        <div className="mt-5 rounded-xl border border-border/60 bg-surface-2/50 p-4">
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-extrabold tracking-tight">
              {formatPrice(price, settings.currencySymbol)}
            </span>
            {off && (
              <span className="text-lg text-muted line-through">
                {formatPrice(product.priceCents, settings.currencySymbol)}
              </span>
            )}
            {off && <span className="badge-accent">{fmt(dict.product.off, { n: off })}</span>}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary">
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
              <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
              <path d="M15 18H9" />
              <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
              <circle cx="17" cy="18" r="2" />
              <circle cx="7" cy="18" r="2" />
            </svg>
            {fmt(dict.product.delivery, { eta: settings.deliveryEstimate })}
          </p>
          <p
            className={`mt-1.5 flex items-center gap-1.5 text-sm font-medium ${outOfStock ? "text-accent" : "text-primary"}`}
          >
            <span
              className={`h-2 w-2 rounded-full ${outOfStock ? "bg-accent" : "bg-primary"}`}
              aria-hidden
            />
            {outOfStock
              ? dict.product.outOfStock
              : product.stock <= 10
                ? fmt(dict.product.onlyLeft, { n: product.stock })
                : dict.product.inStock}
          </p>
        </div>

        <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-muted">
          {productDescription}
        </p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <div className="flex h-12 items-center self-start rounded-lg border border-border bg-surface">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="flex h-full w-11 items-center justify-center text-lg text-muted transition-colors hover:text-foreground"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-10 text-center text-sm font-bold">{qty}</span>
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(product.stock, q + 1))}
              className="flex h-full w-11 items-center justify-center text-lg text-muted transition-colors hover:text-foreground"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <div className="flex flex-1 gap-3">
            {outOfStock ? (
              <div className="flex-1">
                <NotifyMeButton
                  productId={product.id}
                  enabled={notify?.enabled ?? false}
                  loggedIn={notify?.loggedIn ?? false}
                />
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={add}
                  disabled={pending}
                  className="btn-outline btn-lg flex-1 !rounded-xl"
                >
                  {dict.product.addToCart}
                </button>
                <button
                  type="button"
                  onClick={buyNow}
                  disabled={pending}
                  className="btn-primary btn-lg flex-1 !rounded-xl"
                >
                  {dict.product.buyNow}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Reviews */}
        <div className="mt-10 border-t border-border pt-8">
          <h2 className="mb-4 text-lg font-bold">
            {dict.product.reviews} ({product.reviews.length})
          </h2>
          {product.reviews.length === 0 ? (
            <p className="text-sm text-muted">{dict.product.noReviews}</p>
          ) : (
            <ul className="space-y-3">
              {product.reviews.map((r) => (
                <li key={r.id} className="card p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{r.user.name}</p>
                    <p className="text-sm text-amber-500">
                      {"★".repeat(r.rating)}
                      {"☆".repeat(5 - r.rating)}
                    </p>
                  </div>
                  {r.body && <p className="mt-1.5 text-sm leading-relaxed text-muted">{r.body}</p>}
                  <p className="mt-1.5 text-xs text-muted/70">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
