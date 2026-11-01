import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@backend/lib/db";
import { getStoreSettings } from "@backend/lib/settings";
import { productTextWhere } from "@backend/lib/search-filters";
import { EntityStatuses } from "@backend/lib/enums.mjs";
import { EditCampaignModal } from "@frontend/components/admin/entity-modals";
import {
  AddCampaignProducts,
  CampaignProductPrice,
} from "@frontend/components/admin/campaign-products";
import { formatPrice } from "@backend/lib/money";

export const metadata = { title: "Campaign products - Admin" };

export default async function CampaignProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const q = typeof search.q === "string" ? search.q.trim().slice(0, 200) : "";
  const requestedPage = /^\d{1,6}$/.test(search.page ?? "") ? Math.max(1, Number(search.page)) : 1;
  const campaign = await db.campaign.findUnique({
    where: { id },
    include: { products: { include: { product: true }, orderBy: { product: { name: "asc" } } } },
  });
  if (!campaign) notFound();
  const where = productTextWhere(q);
  const count = await db.product.count({ where });
  const totalPages = Math.max(1, Math.ceil(count / 50));
  const page = Math.min(requestedPage, totalPages);
  const [products, settings] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * 50,
      take: 50,
      select: { id: true, name: true, priceCents: true, active: true },
    }),
    getStoreSettings(),
  ]);
  const pageUrl = (next: number) =>
    `/admin/campaigns/${id}?${new URLSearchParams({ q, page: String(next) })}`;
  return (
    <div className="space-y-6">
      <Link href="/admin/campaigns" className="text-sm text-primary">
        Back to campaigns
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{campaign.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {campaign.active ? EntityStatuses.Active : EntityStatuses.Inactive} /{" "}
            {campaign.products.length} products{campaign.flashSale ? " / Flash Sale" : ""}
            {campaign.showInCart ? " / Featured in cart" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <EditCampaignModal campaign={campaign} />
          <Link href={`/products?campaign=${id}`} className="btn-outline btn-sm">
            View collection
          </Link>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-surface-2 p-4 text-sm leading-6">
        Campaign discounts apply automatically while the campaign is active. The lowest price wins
        when a product has multiple offers; discounts do not stack. Deactivating or deleting this
        campaign removes its offers without changing regular prices or other discounts. Inactive
        products stay hidden from customers.
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <section className="card space-y-4 p-5">
          <h2 className="text-lg font-semibold">Select products & apply discount</h2>
          <form className="flex gap-2">
            <input
              type="search"
              name="q"
              defaultValue={q}
              maxLength={200}
              placeholder="Search products, brands, categories..."
              aria-label="Search campaign products"
              className="input min-w-0 flex-1"
            />
            <button className="btn-outline" type="submit">
              Search
            </button>
          </form>
          <p className="text-xs text-muted">
            {count} matching products. Page {page} of {totalPages}.
          </p>
          <AddCampaignProducts
            campaignId={id}
            products={products}
            currencySymbol={settings.currencySymbol}
          />
          <div className="flex gap-3">
            {page > 1 && (
              <Link href={pageUrl(page - 1)} className="text-sm text-primary">
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={pageUrl(page + 1)} className="text-sm text-primary">
                Next
              </Link>
            )}
          </div>
        </section>
        <section className="card p-5">
          <h2 className="mb-4 text-lg font-semibold">
            Campaign products ({campaign.products.length})
          </h2>
          <div className="divide-y divide-border">
            {campaign.products.length ? (
              campaign.products.map(({ product, offerPriceCents }) => (
                <article key={product.id} className="space-y-2 py-4 first:pt-0">
                  <Link
                    href={`/admin/products/${product.id}`}
                    className="font-semibold text-primary"
                  >
                    {product.name}
                  </Link>
                  <p className="text-xs text-muted">
                    Regular: {formatPrice(product.priceCents, settings.currencySymbol)}
                    {!product.active ? " / Inactive product" : ""}
                  </p>
                  {offerPriceCents >= product.priceCents && (
                    <p className="text-xs text-accent">
                      Offer is ignored because it is no longer below the regular price. Update it
                      here.
                    </p>
                  )}
                  <CampaignProductPrice
                    campaignId={id}
                    productId={product.id}
                    priceCents={offerPriceCents}
                    currencySymbol={settings.currencySymbol}
                  />
                </article>
              ))
            ) : (
              <p className="py-6 text-sm text-muted">
                No products yet. Select products and apply a discount to get started.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
