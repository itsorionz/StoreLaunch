import "server-only";
import { db } from "./db";
import { PromotionAudiences, PromotionStatuses, Roles } from "./enums.mjs";
import { productTextWhere } from "./search-filters";

/** /admin/promotions, /admin/promotions/new, /admin/promotions/[id] - active customer count shown in promotion forms */
export async function countActiveCustomers() {
  return db.user.count({ where: { active: true, roles: { has: Roles.Customer } } });
}

/** /admin/promotions/new + /admin/promotions/[id] - campaign options for the promotion form */
export async function listPromotionCampaigns() {
  return db.campaign.findMany({
    orderBy: [{ order: "asc" }, { title: "asc" }],
    select: { id: true, title: true, active: true },
  });
}

/** /admin/promotions - headline counts (page derives pagination from `total`) */
export async function getPromotionsSummary() {
  return Promise.all([
    db.promotion.count(),
    db.promotion.count({ where: { status: PromotionStatuses.Draft } }),
    db.promotion.count({ where: { status: PromotionStatuses.Sent } }),
    countActiveCustomers(),
  ]);
}

/** /admin/promotions - one page of promotions (20 per page) */
export async function listPromotions(page: number) {
  return db.promotion.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * 20,
    take: 20,
    include: { _count: { select: { messages: true } } },
  });
}

/** /admin/promotions - read tallies for the promotions on the current page */
export async function listPromotionReadCounts(promotionIds: string[]) {
  return db.inboxMessage.groupBy({
    by: ["promotionId"],
    where: { promotionId: { in: promotionIds }, readAt: { not: null } },
    _count: true,
  });
}

/** /admin/promotions/[id] - promotion row with its campaign and message count */
export async function getPromotion(id: string) {
  return db.promotion.findUnique({
    where: { id },
    include: {
      campaign: { select: { title: true, active: true } },
      _count: { select: { messages: true } },
    },
  });
}

/** /admin/promotions/[id] - customers selected as recipients */
export async function getPromotionSelectedUsers(selectedUserIds: string[]) {
  return db.user.findMany({
    where: { id: { in: selectedUserIds } },
    select: { id: true, name: true, email: true, phone: true, active: true },
  });
}

/** /admin/promotions/[id] - how many customers the saved audience would reach */
export async function countPromotionEligibleCustomers(audience: string, selectedUserIds: string[]) {
  return db.user.count({
    where: {
      active: true,
      roles: { has: Roles.Customer },
      ...(audience === PromotionAudiences.SelectedCustomers ? { id: { in: selectedUserIds } } : {}),
    },
  });
}

/** /admin/promotions/[id] - delivered messages already read */
export async function countPromotionReads(id: string) {
  return db.inboxMessage.count({ where: { promotionId: id, readAt: { not: null } } });
}

/** /admin/campaigns - full campaign list with product counts (page derives the banner grid) */
export async function listCampaigns() {
  return db.campaign.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { products: true } } },
  });
}

/** /admin/campaigns/[id] - campaign with its discounted products */
export async function getCampaign(id: string) {
  return db.campaign.findUnique({
    where: { id },
    include: { products: { include: { product: true }, orderBy: { product: { name: "asc" } } } },
  });
}

/** /admin/campaigns/[id] - product search total for the current query */
export async function countCampaignProducts(q: string) {
  const where = productTextWhere(q);
  return db.product.count({ where });
}

/** /admin/campaigns/[id] - one page (50) of matching products for the picker */
export async function listCampaignProducts(q: string, page: number) {
  const where = productTextWhere(q);
  return db.product.findMany({
    where,
    orderBy: { name: "asc" },
    skip: (page - 1) * 50,
    take: 50,
    select: { id: true, name: true, priceCents: true, active: true },
  });
}
