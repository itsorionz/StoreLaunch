import Link from "next/link";
import { getActiveCampaign } from "@backend/lib/store-page-queries";
import { Suspense } from "react";
import {
  getProducts,
  getCategoryTree,
  getBrandsWithCount,
  type CategoryTree,
} from "@backend/lib/catalog";
import { getStoreSettings } from "@backend/lib/settings";
import { ProductGrid } from "@frontend/components/products/product-row";
import { SortSelect } from "@frontend/components/products/sort-select";
import { z } from "zod";
import { shortText, validationFailure } from "@backend/lib/form-validation";
import { getDict } from "@frontend/i18n/dict";

const searchSchema = z.object({
  q: shortText.optional(),
  campaign: shortText.optional(),
  category: shortText.optional(),
  brand: shortText.optional(),
  flashSale: z.enum(["0", "1"]).optional(),
  onSale: z.enum(["0", "1"]).optional(),
  sort: z.enum(["newest", "price-asc", "price-desc", "discount", "rating"]).optional(),
  page: z
    .string()
    .regex(/^[1-9]\d{0,5}$/, "Enter a page number between 1 and 999999")
    .optional(),
});

type Search = {
  q?: string;
  campaign?: string;
  category?: string;
  brand?: string;
  flashSale?: string;
  onSale?: string;
  sort?: string;
  page?: string;
};

const sortOptions = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "discount", label: "Biggest Discount" },
  { value: "rating", label: "Top Rated" },
];

async function ProductListing({ searchParams }: { searchParams: Promise<Search> }) {
  const parsed = searchSchema.safeParse(await searchParams);
  if (!parsed.success)
    return (
      <div className="w-full  px-4 py-6">
        <h1 className="text-xl font-bold">Products</h1>
        <p role="alert" className="mt-4 text-sm text-accent">
          {validationFailure(parsed.error).error}
        </p>
        <Link href="/products" className="btn-outline mt-4">
          Clear filters
        </Link>
      </div>
    );
  const params = parsed.data;
  const campaign = params.campaign ? await getActiveCampaign(params.campaign) : null;
  if (params.campaign && !campaign)
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold">Campaign unavailable</h1>
        <p className="mt-2 text-muted">This campaign has ended or is inactive.</p>
        <Link href="/products" className="btn-outline mt-4">
          Browse products
        </Link>
      </div>
    );

  // The campaign narrows the listing only while it is the whole context. Once a
  // category/brand/deal/search filter is set the shopper is browsing the normal
  // catalog — intersecting with the campaign would match almost nothing and make
  // the sidebar look broken.
  const hasOtherFilters = Boolean(
    params.q ||
    params.category ||
    params.brand ||
    params.flashSale === "1" ||
    params.onSale === "1",
  );
  const campaignApplied = Boolean(campaign) && !hasOtherFilters;
  const listing: Search = campaignApplied ? params : { ...params, campaign: undefined };

  const settings = await getStoreSettings();
  const requestedPage = Number(listing.page) || 1;

  const { products, total, totalPages, page } = await getProducts({
    q: listing.q,
    campaign: listing.campaign,
    category: listing.category,
    brand: listing.brand,
    flashSale: listing.flashSale === "1",
    onSale: listing.onSale === "1",
    sort: (listing.sort as never) ?? "newest",
    page: requestedPage,
    perPage: 24,
  });

  const tree = await getCategoryTree();
  const brands = await getBrandsWithCount();
  const dict = await getDict();

  const buildQs = (merged: Search) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "newest" && !(k === "page" && v === "1")) sp.set(k, v);
    }
    const s = sp.toString();
    return `/products${s ? `?${s}` : ""}`;
  };

  // Sort and paging stay on the current view; sidebar browsing leaves the
  // campaign and text search behind so category/brand browsing shows that scope.
  const qs = (overrides: Partial<Search>) => buildQs({ ...params, page: undefined, ...overrides });
  const navQs = (overrides: Partial<Search>) =>
    buildQs({ ...params, campaign: undefined, q: undefined, page: undefined, ...overrides });

  const activeCategoryName = params.category
    ? (findCategoryName(tree, params.category, dict.lang) ?? "Products")
    : null;
  const activeBrandName = params.brand
    ? (brands.find((b) => b.slug === params.brand)?.name ?? null)
    : null;

  const heading = listing.q
    ? `Search: "${listing.q}"`
    : campaignApplied
      ? campaign!.title
      : (activeCategoryName ??
        activeBrandName ??
        (listing.flashSale === "1"
          ? "Flash Sale"
          : listing.onSale === "1"
            ? "On Sale"
            : "All Products"));

  return (
    <div className="w-full  px-4 py-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">{heading}</h1>
        <p className="text-sm text-muted">
          {total} {total === 1 ? "product" : "products"}
        </p>
      </div>

      {campaign && !campaignApplied && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-surface-2 px-4 py-2.5 text-sm text-muted">
          <span>
            <span className="font-medium text-foreground">{campaign.title}</span> isn&apos;t applied
            while other filters are active — showing the full results below.
          </span>
          <Link
            href={`/products?campaign=${params.campaign}`}
            className="font-medium text-primary transition-colors hover:text-primary-dark"
          >
            View campaign only
          </Link>
        </div>
      )}

      <div className="flex gap-6">
        <aside className="hidden w-52 shrink-0 lg:block">
          <FilterSection title="Category">
            <FilterLink href={navQs({ category: undefined })} active={!params.category}>
              All Categories
            </FilterLink>
            {tree.map((c) => (
              <div key={c.id}>
                <FilterLink href={navQs({ category: c.slug })} active={params.category === c.slug}>
                  {dict.lang === "bn" ? c.nameBn || c.name : c.name} ({c.productCount})
                </FilterLink>
                {c.children.length > 0 && (
                  <div className="ml-3">
                    {c.children.map((child) => (
                      <FilterLink
                        key={child.id}
                        href={navQs({ category: child.slug })}
                        active={params.category === child.slug}
                      >
                        {dict.lang === "bn" ? child.nameBn || child.name : child.name} (
                        {child.productCount})
                      </FilterLink>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </FilterSection>

          <FilterSection title="Brand">
            <FilterLink href={navQs({ brand: undefined })} active={!params.brand}>
              All Brands
            </FilterLink>
            {brands.map((b) => (
              <FilterLink
                key={b.id}
                href={navQs({ brand: b.slug })}
                active={params.brand === b.slug}
              >
                {dict.lang === "bn" ? b.nameBn || b.name : b.name} ({b._count.products})
              </FilterLink>
            ))}
          </FilterSection>

          <FilterSection title="Deals">
            <FilterLink
              href={navQs({ flashSale: undefined, onSale: undefined })}
              active={params.flashSale !== "1" && params.onSale !== "1"}
            >
              All deals
            </FilterLink>
            <FilterLink
              href={navQs({ flashSale: "1", onSale: undefined })}
              active={params.flashSale === "1"}
            >
              Flash Sale
            </FilterLink>
            <FilterLink
              href={navQs({ onSale: "1", flashSale: undefined })}
              active={params.onSale === "1"}
            >
              On Sale
            </FilterLink>
          </FilterSection>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-end gap-2">
            <span className="text-sm text-muted">Sort by</span>
            <SortSelect
              value={params.sort ?? "newest"}
              options={sortOptions.map((option) => ({
                ...option,
                href: qs({ sort: option.value, page: undefined }),
              }))}
            />
          </div>

          {campaign && campaignApplied && total === 0 ? (
            <div className="card flex flex-col items-center py-20 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-muted">
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
                  <path d="M3 6h18" />
                  <path d="M7 6a2 2 0 1 0 4 0 2 2 0 1 0 4 0 2 2 0 1 0 4 0" />
                  <path d="M3 6v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6" />
                  <path d="M7 11v3" />
                  <path d="M11 11v3" />
                  <path d="M15 11v3" />
                </svg>
              </div>
              <p className="font-semibold">No products in this campaign yet</p>
              <p className="mt-1 max-w-sm text-sm text-muted">
                {campaign.title} hasn&apos;t listed any products right now. Browse the rest of the
                store instead.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                {campaign.linkUrl && (
                  <Link href={campaign.linkUrl} className="btn">
                    Open campaign link
                  </Link>
                )}
                <Link href="/products" className="btn-outline">
                  Browse all products
                </Link>
              </div>
            </div>
          ) : (
            <ProductGrid
              products={products}
              currencySymbol={settings.currencySymbol}
              deliveryEstimate={settings.deliveryEstimate}
            />
          )}

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              {page > 1 && (
                <Link href={qs({ page: String(page - 1) })} className="btn-outline btn-sm">
                  ← Prev
                </Link>
              )}
              <span className="text-sm text-muted">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Link href={qs({ page: String(page + 1) })} className="btn-outline btn-sm">
                  Next →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function findCategoryName(tree: CategoryTree[], slug: string, lang: "en" | "bn"): string | null {
  for (const c of tree) {
    if (c.slug === slug) return lang === "bn" ? c.nameBn || c.name : c.name;
    const found = findCategoryName(c.children, slug, lang);
    if (found) return found;
  }
  return null;
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-md px-2 py-1 text-sm ${active ? "bg-primary-light font-medium text-primary" : "text-foreground/80 hover:bg-surface-2"}`}
    >
      {children}
    </Link>
  );
}

export default function ProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense
      fallback={<div className="w-full  px-4 py-10 text-center text-muted">Loading products…</div>}
    >
      <ProductListing searchParams={searchParams} />
    </Suspense>
  );
}

export async function generateMetadata() {
  return { title: "Products" };
}
