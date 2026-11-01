import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { connection } from "next/server";
import {
  getCarouselSlides,
  getCampaigns,
  getOfferSections,
  getCategoryTree,
  getFeaturedProducts,
  getFlashSaleProducts,
  getLatestProducts,
  getOnSaleProducts,
  getProducts,
} from "@backend/lib/catalog";
import { getStoreSettings } from "@backend/lib/settings";
import { getDict } from "@frontend/i18n/dict";
import { HeroCarousel, type HeroSlide } from "@frontend/components/layout/hero-carousel";
import { ProductRow } from "@frontend/components/products/product-row";

function shuffleSlides(slides: HeroSlide[]): HeroSlide[] {
  const copy = [...slides];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function ShuffledIntro({
  carouselSlides,
  campaigns,
  campaignLabel,
}: {
  carouselSlides: HeroSlide[];
  campaigns: HeroSlide[];
  campaignLabel: string;
}) {
  // Random shuffling is unstable for prerendering; render this part per request.
  await connection();
  const heroSlides = shuffleSlides(carouselSlides.length ? carouselSlides : campaigns);
  const campaignCards = shuffleSlides(campaigns);
  return (
    <>
      <HeroCarousel slides={heroSlides} />

      {campaignCards.length > 0 && (
        <section aria-label={campaignLabel} className="mb-12">
          <h2 className="mb-4 flex items-center gap-2.5 text-xl font-bold tracking-tight">
            <span className="h-5 w-1 rounded-full bg-primary" aria-hidden />
            {campaignLabel}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {campaignCards.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/products?campaign=${campaign.id}`}
                className="group relative block overflow-hidden rounded-2xl border border-border/60 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className="relative block aspect-[16/9] w-full bg-surface-2">
                  <Image
                    src={campaign.imageUrl}
                    alt={campaign.title}
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <span
                    className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent"
                    aria-hidden
                  />
                  <span className="absolute bottom-3 left-4 right-4 text-sm font-bold text-white">
                    {campaign.title}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

async function HomeContent() {
  const [
    settings,
    campaigns,
    carouselSlides,
    tree,
    featured,
    flash,
    onSale,
    latest,
    bestPicks,
    dict,
    offerSections,
  ] = await Promise.all([
    getStoreSettings(),
    getCampaigns(),
    getCarouselSlides(),
    getCategoryTree(),
    getFeaturedProducts(10),
    getFlashSaleProducts(10),
    getOnSaleProducts(10),
    getLatestProducts(10),
    getProducts({ sort: "rating", perPage: 10 }),
    getDict(),
    getOfferSections(true),
  ]);

  const symbol = settings.currencySymbol;
  const eta = settings.deliveryEstimate;

  return (
    <div className="w-full  px-4 py-6">
      <Suspense
        fallback={
          <>
            <div className="skeleton aspect-[16/5] w-full rounded-2xl" />
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="skeleton aspect-[16/9] rounded-2xl" />
              ))}
            </div>
          </>
        }
      >
        <ShuffledIntro
          carouselSlides={carouselSlides}
          campaigns={campaigns}
          campaignLabel={dict.home.campaigns}
        />
      </Suspense>

      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2.5 text-xl font-bold tracking-tight">
          <span className="h-5 w-1 rounded-full bg-primary" aria-hidden />
          {dict.home.allYouNeed}
        </h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {tree.map((c) => (
            <Link
              key={c.id}
              href={`/categories/${c.slug}`}
              className="group flex flex-col items-center gap-2.5 rounded-xl border border-border/60 bg-surface p-3.5 text-center shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <span className="relative block aspect-square w-full overflow-hidden rounded-lg bg-surface-2">
                <img
                  src={c.imageUrl ?? "/categories/photo-spices.webp"}
                  alt={dict.lang === "bn" ? c.nameBn || c.name : c.name}
                  className="h-full w-full object-contain p-1.5 transition-transform duration-300 group-hover:scale-110"
                />
              </span>
              <span className="text-xs font-semibold leading-tight">
                {dict.lang === "bn" ? c.nameBn || c.name : c.name}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <ProductRow
        title={dict.home.bestPicks}
        href="/products?sort=rating"
        products={bestPicks.products}
        currencySymbol={symbol}
        deliveryEstimate={eta}
      />
      <ProductRow
        title={dict.home.flashSale}
        href="/products?flashSale=1"
        products={flash}
        currencySymbol={symbol}
        deliveryEstimate={eta}
      />
      <ProductRow
        title={dict.home.deals}
        href="/products?onSale=1"
        products={onSale}
        currencySymbol={symbol}
        deliveryEstimate={eta}
      />
      {offerSections.map((section) => (
        <div key={section.id} data-offer-section={section.id}>
          <ProductRow
            title={section.title}
            href={section.href}
            products={section.products}
            currencySymbol={symbol}
            deliveryEstimate={eta}
          />
        </div>
      ))}
      <ProductRow
        title={dict.home.featured}
        href="/products"
        products={featured}
        currencySymbol={symbol}
        deliveryEstimate={eta}
      />
      <ProductRow
        title={dict.home.newArrivals}
        href="/products?sort=newest"
        products={latest}
        currencySymbol={symbol}
        deliveryEstimate={eta}
      />
    </div>
  );
}

function HomeFallback() {
  return (
    <div className="w-full  space-y-6 px-4 py-6">
      <div className="skeleton aspect-[16/5] w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton aspect-[16/9] rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton aspect-square rounded-xl" />
        ))}
      </div>
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-72 w-44 shrink-0 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeContent />
    </Suspense>
  );
}
