import "server-only";
import { db } from "./db";
import type { Prisma } from "@backend/generated/prisma/client";
import { OrderStatuses, ReviewStatuses } from "./enums.mjs";
import { campaignPriceSelect } from "./campaign-pricing";
import { CUSTOMER_ORDER_EVENTS } from "./order-status";

/** /account/addresses */
export async function listAccountAddresses(userId: string) {
  return db.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
}

/** /account layout sidebar */
export async function countPendingStockNotifications(userId: string) {
  return db.stockNotification.count({ where: { userId, notifiedAt: null } });
}

/** /account/notifications */
export async function listAccountStockNotifications(userId: string) {
  return db.stockNotification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          priceCents: true,
          salePriceCents: true,
          stock: true,
          images: true,
        },
      },
    },
  });
}

/** /account/orders/[number] */
export async function getCustomerOrderByNumber(number: string) {
  return db.order.findUnique({
    where: { number },
    include: {
      paymentAttempt: true,
      afterSalesRequests: {
        include: {
          items: { include: { orderItem: { select: { name: true } } } },
          refunds: true,
          replacementOrder: { select: { number: true } },
        },
        orderBy: { requestedAt: "desc" },
      },
      items: true,
      events: {
        where: { type: { in: [...CUSTOMER_ORDER_EVENTS] } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
      rider: { select: { name: true, phone: true } },
      deliveryCompany: { select: { name: true, phone: true, trackingUrl: true } },
    },
  });
}

/** /account/orders */
export async function listAccountOrders(userId: string, filters: Prisma.OrderWhereInput) {
  return db.order.findMany({
    where: { userId, ...filters },
    orderBy: { createdAt: "desc" },
    include: { items: { select: { quantity: true } } },
  });
}

/** /account profile page */
export async function getAccountProfile(userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      phone: true,
      gender: true,
      dateOfBirth: true,
      profilePhotoVersion: true,
    },
  });
}

/** /account/products */
export async function listOrdersWithPurchasedProducts(userId: string) {
  return db.order.findMany({
    where: { userId, status: { not: OrderStatuses.Cancelled } },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      items: {
        select: {
          productId: true,
          quantity: true,
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              images: true,
              priceCents: true,
              salePriceCents: true,
            },
          },
        },
      },
    },
  });
}

/** /account/rate */
export async function getApprovedReviewStats() {
  return db.review.aggregate({
    where: { status: ReviewStatuses.Approved },
    _avg: { rating: true },
    _count: true,
  });
}

/** /account/refer */
export async function countAccountReferrals(userId: string) {
  return db.referral.count({ where: { referrerId: userId } });
}

export async function getAccountReferralRewards(userId: string) {
  return db.referral.aggregate({
    where: { referrerId: userId, rewardedAt: { not: null } },
    _count: true,
    _sum: { rewardCents: true },
  });
}

export async function listAccountReferralHistory(userId: string) {
  return db.referral.findMany({
    where: { referrerId: userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      rewardCents: true,
      currencyCode: true,
      createdAt: true,
      rewardedAt: true,
    },
  });
}

/** /account/report */
export async function listAccountOrderSummaries(userId: string) {
  return db.order.findMany({
    where: { userId },
    select: {
      status: true,
      paidAt: true,
      currencyCode: true,
      totalCents: true,
      items: { select: { quantity: true } },
    },
  });
}

export async function getAccountWalletBalance(userId: string) {
  return db.wallet.findUnique({ where: { userId }, select: { balanceCents: true } });
}

/** /account/reviews */
export async function listAccountReviewableOrders(userId: string) {
  return db.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      number: true,
      status: true,
      createdAt: true,
      items: {
        select: {
          productId: true,
          name: true,
          slug: true,
          priceCents: true,
          quantity: true,
          imageUrl: true,
        },
      },
    },
  });
}

export async function listAccountProductReviews(userId: string) {
  return db.review.findMany({
    where: { userId },
    select: { productId: true, rating: true, body: true, status: true, createdAt: true },
  });
}

/** /account/rider-review */
export async function listAccountRiderReviewOrders(userId: string) {
  return db.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      number: true,
      status: true,
      createdAt: true,
      rider: { select: { name: true, phone: true } },
      riderReview: { select: { rating: true, body: true, createdAt: true } },
      items: {
        select: { name: true, slug: true, imageUrl: true, priceCents: true, quantity: true },
      },
    },
  });
}

/** /account/suggest */
export async function listAccountSuggestions(userId: string) {
  return db.feedback.findMany({
    where: { userId, kind: "suggest" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

/** /account/wishlists */
export async function listAccountWishlistItems(userId: string) {
  return db.wishlist.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          priceCents: true,
          salePriceCents: true,
          campaignOffers: campaignPriceSelect,
          stock: true,
          images: true,
        },
      },
    },
  });
}
