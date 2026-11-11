import "server-only";
import { db } from "./db";

/** /admin/brands - list page with product counts */
export async function listBrands() {
  return db.brand.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });
}

/** /admin/carousel - all slides (page derives the active count) */
export async function listCarouselSlides() {
  return db.carouselSlide.findMany({ orderBy: [{ order: "asc" }, { createdAt: "desc" }] });
}

/** /admin/carousel - active campaigns offered as slide link targets */
export async function listActiveCampaigns() {
  return db.campaign.findMany({
    where: { active: true },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });
}

/** /admin/categories - flat list with product counts (page builds the tree) */
export async function listCategoriesWithCounts() {
  return db.category.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });
}

/** /admin/purchase-orders - list page */
export async function listPurchaseOrders() {
  return db.purchaseOrder.findMany({
    include: { supplier: true },
    orderBy: { createdAt: "desc" },
  });
}

/** /admin/suppliers - list page */
export async function listSuppliers() {
  return db.supplier.findMany({
    orderBy: { name: "asc" },
  });
}
