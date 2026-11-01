import { InboxCategories } from "@backend/lib/enums.mjs";
import "server-only";
import { cache } from "react";
import type { InboxCategory } from "@backend/generated/prisma/client";
import { db } from "./db";

// An offer is delivered once per account. Refreshes never reset its read state.
export const syncInboxPromotions = cache(async (userId: string) => {
  const campaigns = await db.campaign.findMany({
    where: { active: true },
    select: { id: true, title: true, linkUrl: true, createdAt: true },
  });
  if (campaigns.length)
    await db.inboxMessage.createMany({
      data: campaigns.map((campaign) => ({
        userId,
        category: InboxCategories.PROMOTION,
        title: campaign.title,
        body: "Discover this offer from our store.",
        href: campaign.linkUrl || `/products?campaign=${campaign.id}`,
        sourceKey: `campaign:${campaign.id}`,
        createdAt: campaign.createdAt,
      })),
      skipDuplicates: true,
    });
});

export async function getInboxUnreadCount(userId: string) {
  await syncInboxPromotions(userId);
  return db.inboxMessage.count({ where: { userId, readAt: null } });
}

export async function getInbox(
  userId: string,
  category: InboxCategory,
  unreadOnly = false,
  page = 1,
) {
  await syncInboxPromotions(userId);
  const where = { userId, category, ...(unreadOnly ? { readAt: null } : {}) };
  const [total, promotionUnread, notificationUnread] = await Promise.all([
    db.inboxMessage.count({ where }),
    db.inboxMessage.count({ where: { userId, category: InboxCategories.PROMOTION, readAt: null } }),
    db.inboxMessage.count({
      where: { userId, category: InboxCategories.NOTIFICATION, readAt: null },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / 20));
  const currentPage = Math.min(Math.max(1, page), pages);
  const messages = await db.inboxMessage.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * 20,
    take: 20,
  });
  return { messages, total, promotionUnread, notificationUnread, page: currentPage, pages };
}

export async function setInboxRead(userId: string, id: string, read: boolean) {
  return db.inboxMessage.updateMany({
    where: { id, userId },
    data: { readAt: read ? new Date() : null },
  });
}

export async function markInboxCategoryRead(userId: string, category: InboxCategory) {
  await syncInboxPromotions(userId);
  return db.inboxMessage.updateMany({
    where: { userId, category, readAt: null },
    data: { readAt: new Date() },
  });
}
