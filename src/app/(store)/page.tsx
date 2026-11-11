import { Suspense } from "react";
import { unstable_noStore } from "next/cache";
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
import { formatPrice } from "@backend/lib/money";
import { HeroCarousel, type HeroSlide } from "@frontend/components/layout/hero-carousel";
import { CategoryScroll } from "@frontend/components/layout/category-scroll";
import { CampaignScroller } from "@frontend/components/layout/campaign-scroller";
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

      <CampaignScroller campaigns={campaignCards} label={campaignLabel} />
    </>
  );
}

async function HomeContent() {
  unstable_noStore();
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
    <div className="bg-surface min-h-screen px-4 py-6">
      <Suspense
        fallback={
          <>
            <div className="skeleton aspect-[16/5] w-full rounded-2xl mb-8" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-8">
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

      <CategoryScroll categories={tree} dict={dict} />

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
        <div key={section.id} data-offer-section={section.id} className="mb-16">
          <h2 className="mb-4 text-xl font-bold text-primary border-b border-border/60 pb-2">
            {section.title}
          </h2>
          <ProductRow
            title=""
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
      <div className="mt-16 pt-8 border-t border-border/60 text-center">
        <p className="text-sm text-muted mb-2">
          Free delivery on orders over
          <span className="font-medium text-primary">
            {settings.freeShippingOverCents
              ? `${formatPrice(settings.freeShippingOverCents, symbol)}`
              : "any amount"}
          </span>
        </p>
        <p className="text-xs text-muted">{eta}</p>
      </div>
    </div>
  );
}

function HomeFallback() {
  return (
    <div className="bg-surface min-h-screen px-4 py-6">
      <div className="skeleton aspect-[16/5] w-full rounded-2xl mb-8" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-8">
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
