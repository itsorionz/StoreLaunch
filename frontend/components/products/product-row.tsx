"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ProductCard, type ProductCardProps } from "./product-card";
import { useDict } from "@frontend/i18n/provider";
import { useDragPan } from "@frontend/lib/use-drag-pan";

type ProductRowProps = {
  title: string;
  href: string;
  products: ProductCardProps["product"][];
  currencySymbol: string;
  deliveryEstimate: string;
};

export function ProductRow({
  title,
  href,
  products,
  currencySymbol,
  deliveryEstimate,
}: ProductRowProps) {
  const dict = useDict();
  const { scrollRef, onMouseDown } = useDragPan();
  const trackRef = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  // Arrows appear only while the row actually overflows, and each one is
  // disabled at its current end.
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setScrollable(max > 1);
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft >= max - 1);
  }, [scrollRef]);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    // Re-check when the row or its content resizes (window resize, images).
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    if (trackRef.current) observer.observe(trackRef.current);
    return () => observer.disconnect();
  }, [updateScrollState, scrollRef, products.length]);

  const scrollLeft = () => {
    scrollRef.current?.scrollBy({ left: -300, behavior: "smooth" });
  };

  const scrollRight = () => {
    scrollRef.current?.scrollBy({ left: 300, behavior: "smooth" });
  };

  if (!products.length) return null;
  return (
    <section className="mb-12">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2.5 text-xl font-bold tracking-tight">
          <span className="h-5 w-1 rounded-full bg-primary" aria-hidden />
          {title}
        </h2>
        <Link
          href={href}
          className="text-sm font-semibold text-primary transition-colors hover:text-primary-dark"
        >
          {dict.common.seeAll}
        </Link>
      </div>
      {/* Arrows live outside the scroller so they stay fixed while content pans. */}
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={updateScrollState}
          onMouseDown={onMouseDown}
          className="overflow-x-auto scrollbar-hidden pb-2"
        >
          <div ref={trackRef} className="flex gap-[var(--product-card-gap)] pb-2">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                currencySymbol={currencySymbol}
                deliveryEstimate={deliveryEstimate}
              />
            ))}
          </div>
        </div>
        {scrollable && (
          <>
            <button
              type="button"
              onClick={scrollLeft}
              disabled={atStart}
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-l bg-surface/80 px-3 py-2 text-primary transition-colors hover:bg-primary/20 disabled:pointer-events-none disabled:opacity-40"
              aria-label="Scroll left"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={scrollRight}
              disabled={atEnd}
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-r bg-surface/80 px-3 py-2 text-primary transition-colors hover:bg-primary/20 disabled:pointer-events-none disabled:opacity-40"
              aria-label="Scroll right"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </>
        )}
      </div>
    </section>
  );
}

export function ProductGrid({
  products,
  currencySymbol,
  deliveryEstimate,
}: {
  products: ProductCardProps["product"][];
  currencySymbol: string;
  deliveryEstimate: string;
}) {
  if (!products.length) {
    return (
      <div className="card flex flex-col items-center py-20 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-muted">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </div>
        <p className="font-semibold">No products found</p>
        <p className="mt-1 text-sm text-muted">Try a different search or browse all products.</p>
      </div>
    );
  }
  return (
    <div className="product-grid">
      {products.map((p) => (
        <ProductCard
          key={p.id}
          product={p}
          currencySymbol={currencySymbol}
          deliveryEstimate={deliveryEstimate}
        />
      ))}
    </div>
  );
}
