import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getProducts, getBrandBySlug } from "@backend/lib/catalog";
import { getStoreSettings } from "@backend/lib/settings";
import { ProductGrid } from "@frontend/components/products/product-row";
import { getDict } from "@frontend/i18n/dict";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);
  return { title: brand ? `${brand.name} — Brand` : "Brand" };
}

async function BrandContent({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const dict = await getDict();
  const requestedPage = Number(pageParam) || 1;
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();
  const brandName = dict.lang === "bn" ? brand.nameBn || brand.name : brand.name;

  const [settings, { products, total, totalPages, page }] = await Promise.all([
    getStoreSettings(),
    getProducts({ brand: slug, page: requestedPage, perPage: 24 }),
  ]);

  return (
    <>
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-1.5 text-sm text-muted" aria-label="Breadcrumb">
        <Link href="/" className="transition-colors hover:text-primary">
          Home
        </Link>
        <span aria-hidden>/</span>
        <Link href="/products" className="transition-colors hover:text-primary">
          Products
        </Link>
        <span aria-hidden>/</span>
        <span className="font-medium text-foreground">{brandName}</span>
      </nav>

      {/* Brand header */}
      <div className="mb-6 flex items-center gap-4">
        {brand.imageUrl ? (
          <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-surface-2">
            <Image
              src={brand.imageUrl}
              alt={brandName}
              fill
              sizes="64px"
              className="object-contain p-1.5"
            />
          </span>
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary-light text-2xl font-black text-primary">
            {brandName.charAt(0).toUpperCase()}
          </span>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{brandName}</h1>
          <p className="text-sm text-muted">{total} products</p>
        </div>
      </div>

      <ProductGrid
        products={products}
        currencySymbol={settings.currencySymbol}
        deliveryEstimate={settings.deliveryEstimate}
      />

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link href={`/brands/${slug}?page=${page - 1}`} className="btn-outline btn-sm">
              ← Prev
            </Link>
          )}
          <span className="text-sm text-muted">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link href={`/brands/${slug}?page=${page + 1}`} className="btn-outline btn-sm">
              Next →
            </Link>
          )}
        </div>
      )}
    </>
  );
}

export default async function BrandPage({ params, searchParams }: Params) {
  return (
    <div className="w-full  px-4 py-6">
      <Suspense fallback={<div className="skeleton h-64 w-full rounded-2xl" />}>
        <BrandContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
