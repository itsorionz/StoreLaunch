import "server-only";
import { db } from "./db";
import { CareerJobStatuses } from "./enums.mjs";

/** /career */
export async function listPublishedCareerJobs() {
  return db.careerJob.findMany({
    where: {
      status: CareerJobStatuses.Published,
      OR: [{ closesAt: null }, { closesAt: { gte: new Date() } }],
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      department: true,
      location: true,
      employmentType: true,
      workplaceMode: true,
      summary: true,
      description: true,
      requirements: true,
      closesAt: true,
    },
  });
}

/** /order/[number]/result */
export async function getOrderResultByNumber(number: string) {
  return db.order.findUnique({ where: { number }, include: { items: true } });
}

/** /products/[slug] */
export async function getStockNotification(userId: string, productId: string) {
  return db.stockNotification.findUnique({
    where: { userId_productId: { userId, productId } },
  });
}

export async function getWishlistItem(userId: string, productId: string) {
  return db.wishlist.findUnique({
    where: { userId_productId: { userId, productId } },
  });
}

/** /products */
export async function getActiveCampaign(id: string) {
  return db.campaign.findFirst({
    where: { id, active: true },
    select: { title: true, linkUrl: true },
  });
}
