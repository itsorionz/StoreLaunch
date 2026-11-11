import "server-only";
import { db } from "./db";
import { discountPercent } from "./money";

export interface ProductCardData {
  id: string;
  name: string;
  nameBn: string | null;
  slug: string;
  priceCents: number;
  salePriceCents: number | null;
  stock: number;
  images: string[];
  flashSale: boolean;
  featured: boolean;
  brand: { name: string; nameBn: string | null; slug: string } | null;
  ratingAvg: number;
  ratingCount: number;
}

/** Row data for the admin products table. */
export interface ProductTableRow {
  id: string;
  name: string;
  categoryName: string;
  brandName: string | null;
  priceCents: number;
  salePriceCents: number | null;
  stock: number;
  discountPercent: number | null;
  status: string;
  // Fields used by the admin page JSX (passed through from Prisma)
  images: string[];
  nameBn: string | null;
  slug: string;
  sku: string;
  barcode: string;
  description: string;
  descriptionBn: string | null;
  costCents: number;
  weightGrams: number;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  categoryId: string;
  brandId: string | null;
  flashSale: boolean;
  featured: boolean;
  active: boolean;
}

/** /admin/products - list page with stock filter and tables */
export async function getProductsList(filters: { stock?: "low" | "out" | null }): Promise<{
  products: ProductTableRow[];
  categories: { id: string; name: string; parentId: string | null }[];
  brands: { id: string; name: string }[];
  total: number;
}> {
  const stockFilter = filters.stock ?? null;

  const [products, categories, brands] = await Promise.all([
    db.product.findMany({
      where: stockFilter ? { active: true, stock: stockFilter === "out" ? 0 : { lte: 5 } } : {},
      orderBy: { createdAt: "desc" },
      include: { category: true, brand: true },
    }),
    db.category.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true, parentId: true },
    }),
    db.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return {
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      categoryName: p.category.name,
      brandName: p.brand?.name ?? null,
      priceCents: p.priceCents,
      salePriceCents: p.salePriceCents,
      stock: p.stock,
      discountPercent: discountPercent(p.priceCents, p.salePriceCents),
      status: p.active ? "Active" : "Inactive",
      // Pass-through fields for the admin page JSX
      images: p.images,
      nameBn: p.nameBn,
      slug: p.slug,
      sku: p.sku ?? "",
      barcode: p.barcode ?? "",
      description: p.description ?? "",
      descriptionBn: p.descriptionBn ?? "",
      costCents: p.costCents ?? 0,
      weightGrams: p.weightGrams ?? 0,
      lengthMm: p.lengthMm ?? 0,
      widthMm: p.widthMm ?? 0,
      heightMm: p.heightMm ?? 0,
      categoryId: p.categoryId,
      brandId: p.brandId ?? null,
      flashSale: p.flashSale,
      featured: p.featured,
      active: p.active,
    })),
    categories,
    brands,
    total: products.length,
  };
}

/** /admin/products/new and /admin/products/[id] - category options for ProductForm */
export async function listProductFormCategories() {
  return db.category.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true, name: true, nameBn: true, parentId: true },
  });
}

/** /admin/products/new and /admin/products/[id] - brand options for ProductForm */
export async function listProductFormBrands() {
  return db.brand.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, nameBn: true },
  });
}

/** /admin/products/print-barcodes - every product that has a barcode, for the label builder. */
export async function getProductsForBarcodePrint() {
  const products = await db.product.findMany({
    where: { barcode: { not: null } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      nameBn: true,
      priceCents: true,
      salePriceCents: true,
      barcode: true,
      sku: true,
      stock: true,
      category: { select: { name: true } },
    },
  });

  return products.map(({ category, ...product }) => ({
    ...product,
    categoryName: category.name,
  }));
}

/** /admin/products/[id] - edit page product with recent inventory adjustments */
export async function getAdminProductDetail(id: string) {
  return db.product.findUnique({
    where: { id },
    include: { inventoryAdjustments: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
}
