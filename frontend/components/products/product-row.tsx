"use client";

import Link from "next/link";
import { ProductCard, type ProductCardProps } from "./product-card";
import { useDict } from "@frontend/i18n/provider";

export function ProductRow({
  title,
  href,
  products,
  currencySymbol,
  deliveryEstimate,
}: {
  title: string;
  href: string;
  products: ProductCardProps["product"][];
  currencySymbol: string;
  deliveryEstimate: string;
}) {
  const dict = useDict();
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
      <div className="flex gap-[var(--product-card-gap)] overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {products.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            currencySymbol={currencySymbol}
            deliveryEstimate={deliveryEstimate}
          />
        ))}
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
