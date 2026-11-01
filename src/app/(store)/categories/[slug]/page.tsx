import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProducts, getCategoryBySlug } from "@backend/lib/catalog";
import { getStoreSettings } from "@backend/lib/settings";
import { ProductGrid } from "@frontend/components/products/product-row";
import { getDict } from "@frontend/i18n/dict";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cat = await getCategoryBySlug(slug);
  return { title: cat?.name ?? "Category" };
}

async function CategoryContent({
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
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();
  const categoryName = dict.lang === "bn" ? category.nameBn || category.name : category.name;

  const [settings, { products, total, totalPages, page }] = await Promise.all([
    getStoreSettings(),
    getProducts({ category: slug, page: requestedPage, perPage: 24 }),
  ]);

  return (
    <>
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-1.5 text-sm text-muted" aria-label="Breadcrumb">
        <Link href="/" className="transition-colors hover:text-primary">
          Home
        </Link>
        <span aria-hidden>/</span>
        {category.parent ? (
          <>
            <Link
              href={`/categories/${category.parent.slug}`}
              className="transition-colors hover:text-primary"
            >
              {dict.lang === "bn"
                ? category.parent.nameBn || category.parent.name
                : category.parent.name}
            </Link>
            <span aria-hidden>/</span>
          </>
        ) : null}
        <span className="font-medium text-foreground">{categoryName}</span>
      </nav>

      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-bold">{categoryName}</h1>
        <p className="text-sm text-muted">{total} products</p>
      </div>

      {/* Subcategory chips */}
      {category.children.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {category.children.map((child) => (
            <Link
              key={child.id}
              href={`/categories/${child.slug}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-foreground/80 transition-all hover:-translate-y-0.5 hover:border-primary hover:text-primary"
            >
              {dict.lang === "bn" ? child.nameBn || child.name : child.name}
              <span className="text-xs text-muted">({child._count.products})</span>
            </Link>
          ))}
        </div>
      )}

      <ProductGrid
        products={products}
        currencySymbol={settings.currencySymbol}
        deliveryEstimate={settings.deliveryEstimate}
      />

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link href={`/categories/${slug}?page=${page - 1}`} className="btn-outline btn-sm">
              ← Prev
            </Link>
          )}
          <span className="text-sm text-muted">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link href={`/categories/${slug}?page=${page + 1}`} className="btn-outline btn-sm">
              Next →
            </Link>
          )}
        </div>
      )}
    </>
  );
}

export default async function CategoryPage({ params, searchParams }: Params) {
  return (
    <div className="w-full  px-4 py-6">
      <Suspense fallback={<div className="skeleton h-64 w-full rounded-2xl" />}>
        <CategoryContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
