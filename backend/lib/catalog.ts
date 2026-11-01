import { campaignPriceSelect, withCampaignPrice } from "./campaign-pricing";
import { productTextWhere } from "./search-filters";
import { ReviewStatuses } from "@backend/lib/enums.mjs";
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "./db";
import type { Prisma } from "@backend/generated/prisma/client";
import { effectivePriceCents } from "./money";

export type ProductCardData = {
  id: string;
  name: string;
  nameBn: string | null;
  slug: string;
  priceCents: number;
  salePriceCents: number | null;
  stock: number;
  images: string[];
  flashSale: boolean;
  brand: { name: string; nameBn: string | null; slug: string } | null;
  ratingAvg: number;
  ratingCount: number;
};

const cardSelect = {
  id: true,
  name: true,
  nameBn: true,
  slug: true,
  priceCents: true,
  salePriceCents: true,
  stock: true,
  images: true,
  flashSale: true,
  campaignOffers: campaignPriceSelect,
  brand: { select: { name: true, nameBn: true, slug: true } },
  reviews: {
    where: { status: ReviewStatuses.Approved },
    select: { rating: true },
  },
};

type RawProduct = {
  id: string;
  name: string;
  nameBn: string | null;
  slug: string;
  priceCents: number;
  salePriceCents: number | null;
  stock: number;
  images: string[];
  flashSale: boolean;
  brand: { name: string; nameBn: string | null; slug: string } | null;
  campaignOffers: { offerPriceCents: number; campaign: { flashSale: boolean } }[];
  reviews: { rating: number }[];
};

function toCard(raw: RawProduct): ProductCardData {
  const p = withCampaignPrice(raw);
  const count = p.reviews.length;
  const avg = count ? p.reviews.reduce((s, r) => s + r.rating, 0) / count : 0;
  return {
    id: p.id,
    name: p.name,
    nameBn: p.nameBn,
    slug: p.slug,
    priceCents: p.priceCents,
    salePriceCents: p.salePriceCents,
    stock: p.stock,
    images: p.images,
    flashSale: p.flashSale,
    brand: p.brand,
    ratingAvg: Math.round(avg * 10) / 10,
    ratingCount: count,
  };
}

function discountPct(p: { priceCents: number; salePriceCents: number | null }): number {
  if (!p.salePriceCents || p.salePriceCents >= p.priceCents) return 0;
  return Math.round(((p.priceCents - p.salePriceCents) / p.priceCents) * 100);
}

export type ProductQuery = {
  q?: string;
  category?: string;
  brand?: string;
  campaign?: string;
  flashSale?: boolean;
  onSale?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sort?: "newest" | "price-asc" | "price-desc" | "discount" | "rating";
  page?: number;
  perPage?: number;
};

async function resolveCategorySlugs(slug: string): Promise<string[]> {
  const categories = await db.category.findMany({
    select: { id: true, slug: true, parentId: true },
  });
  const root = categories.find((category) => category.slug === slug);
  if (!root) return [slug];
  const found = new Set([root.id]);
  const slugs = [root.slug];
  const pending = [root.id];
  for (let i = 0; i < pending.length; i++)
    for (const child of categories) {
      if (child.parentId === pending[i] && !found.has(child.id)) {
        found.add(child.id);
        pending.push(child.id);
        slugs.push(child.slug);
      }
    }
  return slugs;
}

export async function getProducts(query: ProductQuery = {}): Promise<{
  products: ProductCardData[];
  total: number;
  page: number;
  totalPages: number;
}> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");

  return searchProducts(query);
}

/** Uncached query boundary for server callers and database integration checks. */
export async function searchProducts(query: ProductQuery = {}) {
  const requestedPage = Number.isSafeInteger(query.page) ? Math.max(1, query.page!) : 1;
  const perPage = Number.isSafeInteger(query.perPage)
    ? Math.min(100, Math.max(1, query.perPage!))
    : 24;

  let categorySlugs: string[] | undefined;
  if (query.category) {
    categorySlugs = await resolveCategorySlugs(query.category);
  }

  const where: Prisma.ProductWhereInput = {
    active: true,
    ...productTextWhere(query.q ?? ""),
    ...(categorySlugs ? { category: { slug: { in: categorySlugs } } } : {}),
    ...(query.brand ? { brand: { slug: query.brand } } : {}),
    ...(query.campaign
      ? { campaignOffers: { some: { campaignId: query.campaign, campaign: { active: true } } } }
      : {}),
  };
  // Resolve campaign prices before price/discount sorting, filtering and pagination.
  const raw = await db.product.findMany({
    where,
    select: {
      id: true,
      priceCents: true,
      salePriceCents: true,
      flashSale: true,
      campaignOffers: campaignPriceSelect,
      ...(query.sort === "rating"
        ? { reviews: { where: { status: ReviewStatuses.Approved }, select: { rating: true } } }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  const matches = raw
    .map(withCampaignPrice)
    .filter(
      (product) =>
        (!query.flashSale || (product.flashSale && product.salePriceCents !== null)) &&
        (!query.onSale || product.salePriceCents !== null) &&
        (query.minPrice == null ||
          effectivePriceCents(product.priceCents, product.salePriceCents) >= query.minPrice) &&
        (query.maxPrice == null ||
          effectivePriceCents(product.priceCents, product.salePriceCents) <= query.maxPrice),
    );
  const rating = (product: (typeof raw)[number]) => {
    const reviews = product.reviews ?? [];
    return reviews.length
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : 0;
  };
  if (query.sort && query.sort !== "newest")
    matches.sort((a, b) => {
      const result =
        query.sort === "discount"
          ? discountPct(b) - discountPct(a)
          : query.sort === "rating"
            ? rating(b) - rating(a) || (b.reviews?.length ?? 0) - (a.reviews?.length ?? 0)
            : query.sort === "price-desc"
              ? effectivePriceCents(b.priceCents, b.salePriceCents) -
                effectivePriceCents(a.priceCents, a.salePriceCents)
              : effectivePriceCents(a.priceCents, a.salePriceCents) -
                effectivePriceCents(b.priceCents, b.salePriceCents);
      return result || a.id.localeCompare(b.id);
    });
  const total = matches.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(requestedPage, totalPages);
  const ids = matches.slice((page - 1) * perPage, page * perPage).map((product) => product.id);
  const pageProducts = await db.product.findMany({
    where: { id: { in: ids } },
    select: cardSelect,
  });
  const cards = new Map(pageProducts.map((product) => [product.id, toCard(product)]));
  return {
    products: ids.flatMap((id) => {
      const card = cards.get(id);
      return card ? [card] : [];
    }),
    total,
    page,
    totalPages,
  };
}

export async function getFeaturedProducts(limit = 10): Promise<ProductCardData[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("products");
  const raw = await db.product.findMany({
    where: { active: true, featured: true },
    select: cardSelect,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return raw.map(toCard);
}

export async function getFlashSaleProducts(limit = 10): Promise<ProductCardData[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");
  return (await searchProducts({ flashSale: true, perPage: limit })).products;
}

export async function getOnSaleProducts(limit = 10): Promise<ProductCardData[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");
  return (await searchProducts({ onSale: true, sort: "discount", perPage: limit })).products;
}

export async function getLatestProducts(limit = 10): Promise<ProductCardData[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");
  const raw = await db.product.findMany({
    where: { active: true },
    select: cardSelect,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return raw.map(toCard);
}

export type CategoryTree = {
  id: string;
  name: string;
  nameBn: string | null;
  slug: string;
  imageUrl: string | null;
  parentId: string | null;
  productCount: number;
  children: CategoryTree[];
};

export async function getCategoryTree(): Promise<CategoryTree[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("categories");
  const all = await db.category.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      nameBn: true,
      slug: true,
      imageUrl: true,
      parentId: true,
      _count: { select: { products: true } },
    },
  });
  const map = new Map<string, CategoryTree>();
  for (const c of all) {
    map.set(c.id, {
      id: c.id,
      name: c.name,
      nameBn: c.nameBn,
      slug: c.slug,
      imageUrl: c.imageUrl,
      parentId: c.parentId,
      productCount: c._count.products,
      children: [],
    });
  }
  const roots: CategoryTree[] = [];
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export async function getCategories() {
  "use cache";
  cacheLife("hours");
  cacheTag("categories");
  return db.category.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      nameBn: true,
      slug: true,
      imageUrl: true,
      parentId: true,
      _count: { select: { products: true } },
    },
  });
}

export async function getCategoryBySlug(slug: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("categories");
  const cat = await db.category.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      nameBn: true,
      slug: true,
      imageUrl: true,
      parentId: true,
      parent: { select: { name: true, nameBn: true, slug: true } },
      children: {
        select: {
          id: true,
          name: true,
          nameBn: true,
          slug: true,
          imageUrl: true,
          _count: { select: { products: true } },
        },
        orderBy: { order: "asc" },
      },
      _count: { select: { products: true } },
    },
  });
  if (!cat) return null;
  return {
    id: cat.id,
    name: cat.name,
    nameBn: cat.nameBn,
    slug: cat.slug,
    imageUrl: cat.imageUrl,
    parentId: cat.parentId,
    parent: cat.parent,
    children: cat.children,
    productCount: cat._count.products,
  };
}

export async function getBrands() {
  "use cache";
  cacheLife("hours");
  cacheTag("brands");
  return db.brand.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, nameBn: true, slug: true, imageUrl: true },
  });
}

export async function getBrandsWithCount() {
  "use cache";
  cacheLife("hours");
  cacheTag("brands");
  return db.brand.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      nameBn: true,
      slug: true,
      imageUrl: true,
      _count: { select: { products: true } },
    },
  });
}

export async function getBrandBySlug(slug: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("brands");
  const b = await db.brand.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      nameBn: true,
      slug: true,
      imageUrl: true,
      _count: { select: { products: true } },
    },
  });
  if (!b) return null;
  return {
    id: b.id,
    name: b.name,
    nameBn: b.nameBn,
    slug: b.slug,
    imageUrl: b.imageUrl,
    productCount: b._count.products,
  };
}

export async function getCampaigns() {
  "use cache";
  cacheLife("hours");
  cacheTag("campaigns");
  const campaigns = await db.campaign.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
    select: { id: true, title: true, imageUrl: true, linkUrl: true },
  });
  return campaigns.map((campaign) => ({
    ...campaign,
    linkUrl: campaign.linkUrl || `/products?campaign=${campaign.id}`,
  }));
}

export async function getCarouselSlides() {
  "use cache";
  cacheLife("minutes");
  cacheTag("carousel");
  const slides = await db.carouselSlide.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
    select: { id: true, title: true, imageUrl: true, linkUrl: true },
  });
  return slides.map((slide) => ({
    id: slide.id,
    title: slide.title ?? "",
    imageUrl: slide.imageUrl,
    linkUrl: slide.linkUrl || "/",
  }));
}

export async function getOfferSections(homeOnly = false) {
  "use cache";
  cacheLife("minutes");
  cacheTag("campaigns", "products");
  const campaigns = await db.campaign.findMany({
    where: {
      active: true,
      ...(homeOnly ? { showOnHome: true } : {}),
      products: { some: { product: { active: true } } },
    },
    orderBy: [{ order: "asc" }, { title: "asc" }],
    select: { id: true, title: true, flashSale: true },
  });
  const sections = await Promise.all(
    campaigns.map(async (campaign) => ({
      ...campaign,
      href: `/products?campaign=${campaign.id}`,
      ...(await searchProducts({ campaign: campaign.id, sort: "discount", perPage: 10 })),
    })),
  );
  return sections.filter((section) => section.products.length > 0);
}

export type ProductDetail = ProductCardData & {
  description: string;
  descriptionBn: string | null;
  category: {
    name: string;
    nameBn: string | null;
    slug: string;
    parent: { name: string; nameBn: string | null; slug: string } | null;
  };
  reviews: {
    id: string;
    rating: number;
    body: string;
    createdAt: Date;
    user: { name: string };
  }[];
};

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");
  const p = await db.product.findUnique({
    where: { slug },
    select: {
      ...cardSelect,
      active: true,
      description: true,
      descriptionBn: true,
      category: {
        select: {
          name: true,
          nameBn: true,
          slug: true,
          parent: { select: { name: true, nameBn: true, slug: true } },
        },
      },
      reviews: {
        where: { status: ReviewStatuses.Approved },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          rating: true,
          body: true,
          createdAt: true,
          user: { select: { name: true } },
        },
      },
    },
  });
  if (!p || !p.active) return null;
  return {
    ...toCard(p),
    description: p.description,
    descriptionBn: p.descriptionBn,
    category: p.category,
    reviews: p.reviews,
  };
}

export async function getRelatedProducts(
  categorySlug: string,
  excludeId: string,
  limit = 8,
): Promise<ProductCardData[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");
  const slugs = await resolveCategorySlugs(categorySlug);
  const raw = await db.product.findMany({
    where: { active: true, category: { slug: { in: slugs } }, id: { not: excludeId } },
    select: cardSelect,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return raw.map(toCard);
}
