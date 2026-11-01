import { Suspense } from "react";
import Link from "next/link";
import { getOfferSections } from "@backend/lib/catalog";
import { getStoreSettings } from "@backend/lib/settings";
import { getDict } from "@frontend/i18n/dict";
import { ProductRow } from "@frontend/components/products/product-row";

export const metadata = { title: "Offers & deals" };
async function OffersContent() {
  const [sections, settings, dict] = await Promise.all([
    getOfferSections(),
    getStoreSettings(),
    getDict(),
  ]);
  return (
    <div className="w-full space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{dict.offers.title}</h1>
          <p className="mt-2 text-sm text-muted">{dict.offers.subtitle}</p>
        </div>
        <Link href="/account/inbox?tab=promotion" className="btn-outline">
          {dict.header.inbox}
        </Link>
      </div>
      {sections.length ? (
        sections.map((section) => (
          <div key={section.id} data-offer-section={section.id}>
            <ProductRow
              title={section.title}
              href={section.href}
              products={section.products}
              currencySymbol={settings.currencySymbol}
              deliveryEstimate={settings.deliveryEstimate}
            />
          </div>
        ))
      ) : (
        <div className="card p-12 text-center">
          <p className="text-muted">{dict.offers.empty}</p>
          <Link href="/products" className="btn-primary mt-4">
            {dict.header.allProducts}
          </Link>
        </div>
      )}
    </div>
  );
}
export default function OffersPage() {
  return (
    <Suspense fallback={<div className="skeleton m-4 h-96 rounded-xl" />}>
      <OffersContent />
    </Suspense>
  );
}
