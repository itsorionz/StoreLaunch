import "server-only";
import { db } from "./db";
import { adminDashboardPeriods } from "./admin-dashboard-periods";
import { OrderStatuses, RefundStatuses, OrderEventTypes } from "./enums.mjs";
import { formatPrice, orderCurrencyLabel, effectivePriceCents } from "./money";
import type { Prisma } from "@backend/generated/prisma/client";

const DAY = 86400000;
const HOUR = 3600000;

/**
 * Owner-monitoring data layer (docs/admin-owner-dashboard-plan.md).
 *
 * Every function here is read-only and answers a question the business owner
 * asks about the whole business: how much profit did we make, what cash do we
 * hold or owe, where is demand leaking, and who did what. Amounts are integer
 * cents; currency-aware aggregates are labelled per currency.
 */

// ---------------------------------------------------------------------------
// Profit — period-scoped gross profit on delivered orders (store currency).
// ---------------------------------------------------------------------------

export async function getProfitSnapshot(currencyCode: string, range?: string, now = new Date()) {
  const period = adminDashboardPeriods(range, now);
  const orders = await db.order.findMany({
    where: {
      status: OrderStatuses.Delivered,
      currencyCode,
      deliveredAt: { gte: period.start, lte: now },
    },
    select: {
      items: {
        select: {
          priceCents: true,
          quantity: true,
          product: {
            select: {
              costCents: true,
              categoryId: true,
              category: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  let revenueCents = 0;
  let costCents = 0;
  const byCategory = new Map<string, { name: string; revenueCents: number; costCents: number }>();

  for (const order of orders) {
    for (const item of order.items) {
      const revenue = item.priceCents * item.quantity;
      const cost = (item.product.costCents ?? 0) * item.quantity;
      revenueCents += revenue;
      costCents += cost;

      const key = item.product.categoryId ?? "uncategorized";
      const bucket = byCategory.get(key) ?? {
        name: item.product.category?.name ?? "Uncategorized",
        revenueCents: 0,
        costCents: 0,
      };
      bucket.revenueCents += revenue;
      bucket.costCents += cost;
      byCategory.set(key, bucket);
    }
  }

  const grossProfitCents = revenueCents - costCents;
  const categories = [...byCategory.values()]
    .map((c) => ({
      name: c.name,
      revenueCents: c.revenueCents,
      costCents: c.costCents,
      profitCents: c.revenueCents - c.costCents,
      marginPercent:
        c.revenueCents > 0 ? ((c.revenueCents - c.costCents) / c.revenueCents) * 100 : 0,
    }))
    .sort((a, b) => b.profitCents - a.profitCents);

  return {
    period,
    deliveredOrders: orders.length,
    revenueCents,
    costCents,
    grossProfitCents,
    marginPercent: revenueCents > 0 ? (grossProfitCents / revenueCents) * 100 : 0,
    categories,
  };
}

// ---------------------------------------------------------------------------
// Money position — wallet liability, COD cash held by couriers, recent refunds.
// ---------------------------------------------------------------------------

export async function getMoneyPosition(currencyCode: string, now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY);

  const [wallet, codHeldRows, refundByTender, refundAwaiting] = await Promise.all([
    db.wallet.aggregate({
      where: { balanceCents: { gt: 0 } },
      _sum: { balanceCents: true },
      _count: true,
    }),
    // Cash collected by couriers that is neither remitted to the store nor
    // fully applied to a settlement batch (mirrors the dashboard's unremitted
    // logic, broken down per courier).
    db.$queryRaw<
      Array<{
        courierName: string | null;
        currencyCode: string;
        amountCents: bigint;
        collections: bigint;
      }>
    >`
      SELECT c."courierName", c."currencyCode",
             SUM(c."amountCents" - COALESCE(s."appliedCents", 0))::bigint AS "amountCents",
             COUNT(*)::bigint AS "collections"
      FROM "CodCollection" c
      LEFT JOIN (
        SELECT "codCollectionId", SUM("appliedCents") AS "appliedCents"
        FROM "CodSettlementLine" GROUP BY "codCollectionId"
      ) s ON s."codCollectionId" = c.id
      WHERE c."remittedAt" IS NULL AND c."amountCents" > COALESCE(s."appliedCents", 0)
      GROUP BY c."courierName", c."currencyCode"
      ORDER BY "amountCents" DESC`,
    db.refundRecord.groupBy({
      by: ["tender", "currencyCode"],
      where: { status: RefundStatuses.Completed, createdAt: { gte: since } },
      _sum: { amountCents: true },
      _count: true,
    }),
    db.refundRecord.count({ where: { status: RefundStatuses.AwaitingExternal } }),
  ]);

  const codHeld = codHeldRows.map((row) => ({
    courierName: row.courierName ?? "Mixed / legacy",
    currencyCode: row.currencyCode,
    amountCents: Number(row.amountCents),
    collections: Number(row.collections),
  }));

  const perCurrency = new Map<
    string,
    { currencyCode: string; amountCents: number; collections: number }
  >();
  for (const row of codHeld) {
    const bucket = perCurrency.get(row.currencyCode) ?? {
      currencyCode: row.currencyCode,
      amountCents: 0,
      collections: 0,
    };
    bucket.amountCents += row.amountCents;
    bucket.collections += row.collections;
    perCurrency.set(row.currencyCode, bucket);
  }
  const codHeldByCurrency = [...perCurrency.values()].sort((a, b) => b.amountCents - a.amountCents);

  // Refund totals are store-currency only: a foreign-currency payout must not
  // be added to a BDT figure (mirrors the per-currency COD breakdown). Other
  // currencies are reported separately so nothing is silently dropped.
  const storeRefunds = refundByTender.filter((row) => row.currencyCode === currencyCode);
  const tenderCents = (tender: "Wallet" | "Gateway" | "Cash") =>
    storeRefunds.find((row) => row.tender === tender)?._sum.amountCents ?? 0;
  const walletCents = tenderCents("Wallet");
  const gatewayCents = tenderCents("Gateway");
  const cashCents = tenderCents("Cash");
  const otherRefunds = new Map<
    string,
    { currencyCode: string; amountCents: number; count: number }
  >();
  for (const row of refundByTender) {
    if (row.currencyCode === currencyCode) continue;
    const bucket = otherRefunds.get(row.currencyCode) ?? {
      currencyCode: row.currencyCode,
      amountCents: 0,
      count: 0,
    };
    bucket.amountCents += row._sum.amountCents ?? 0;
    bucket.count += row._count;
    otherRefunds.set(row.currencyCode, bucket);
  }
  const refunds = {
    walletCents,
    gatewayCents,
    cashCents,
    totalCents: walletCents + gatewayCents + cashCents,
    count: storeRefunds.reduce((sum, row) => sum + row._count, 0),
    awaitingExternal: refundAwaiting,
    otherCurrencies: {
      count: [...otherRefunds.values()].reduce((sum, row) => sum + row.count, 0),
      byCurrency: [...otherRefunds.values()].sort((a, b) => b.amountCents - a.amountCents),
    },
  };

  return {
    walletLiabilityCents: wallet._sum.balanceCents ?? 0,
    walletAccounts: wallet._count,
    codHeld,
    codHeldByCurrency,
    codHeldStoreCurrencyCents: codHeld
      .filter((row) => row.currencyCode === currencyCode)
      .reduce((sum, row) => sum + row.amountCents, 0),
    codHeldOtherCurrencies: codHeld.filter((row) => row.currencyCode !== currencyCode).length,
    codHeldCollections: codHeld.reduce((sum, row) => sum + row.collections, 0),
    refunds,
  };
}

// ---------------------------------------------------------------------------
// License & instance health.
// ---------------------------------------------------------------------------

export type LicenseState = "active" | "expiring" | "expired" | "revoked" | "missing";

export async function getLicenseStatus(now = new Date()) {
  const [activeLicense, latest] = await Promise.all([
    db.license.findFirst({ where: { revokedAt: null }, orderBy: { createdAt: "desc" } }),
    db.license.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);

  if (!activeLicense) {
    const state: LicenseState = latest?.revokedAt ? "revoked" : "missing";
    return {
      state,
      daysToExpiry: null as number | null,
      expiresAt: null as Date | null,
      activatedAt: latest?.activatedAt ?? null,
      storeSlug: latest?.storeSlug ?? null,
    };
  }

  const daysToExpiry = activeLicense.expiresAt
    ? Math.ceil((activeLicense.expiresAt.getTime() - now.getTime()) / DAY)
    : null;
  const state: LicenseState =
    daysToExpiry === null
      ? "active"
      : daysToExpiry <= 0
        ? "expired"
        : daysToExpiry <= 30
          ? "expiring"
          : "active";

  return {
    state,
    daysToExpiry,
    expiresAt: activeLicense.expiresAt,
    activatedAt: activeLicense.activatedAt,
    storeSlug: activeLicense.storeSlug,
  };
}

// ---------------------------------------------------------------------------
// Growth signals — abandoned carts, wishlist/restock demand, referrals.
// ---------------------------------------------------------------------------

const ABANDON_AFTER_MS = 30 * 60_000;

export async function getGrowthSignals(now = new Date()) {
  const cutoff = new Date(now.getTime() - ABANDON_AFTER_MS);

  const [
    carts,
    wishlists,
    restockRequests,
    referrerCount,
    signups,
    rewards,
    storeSettings,
    wishlistSaves,
    restockWaiting,
  ] = await Promise.all([
    db.cart.findMany({
      where: { updatedAt: { lte: cutoff } },
      select: {
        id: true,
        userId: true,
        updatedAt: true,
        items: {
          where: { selected: true },
          select: {
            quantity: true,
            product: {
              select: {
                id: true,
                name: true,
                priceCents: true,
                salePriceCents: true,
                active: true,
              },
            },
          },
        },
      },
    }),
    db.wishlist.groupBy({
      by: ["productId"],
      _count: true,
      orderBy: { _count: { productId: "desc" } },
      take: 8,
    }),
    db.stockNotification.groupBy({
      by: ["productId"],
      where: { notifiedAt: null },
      _count: true,
      orderBy: { _count: { productId: "desc" } },
      take: 8,
    }),
    db.user.count({ where: { referralsSent: { some: {} } } }),
    // One Referral row per referred signup; rewarded rows carry the order
    // that qualified the payout.
    db.referral.count(),
    db.referral.aggregate({
      where: { rewardedAt: { not: null } },
      _sum: { rewardCents: true },
      _count: true,
    }),
    db.storeSettings.findFirst({ select: { referralRewardCents: true } }),
    db.wishlist.count(),
    db.stockNotification.count({ where: { notifiedAt: null } }),
  ]);

  // A user cart is only abandoned if that user has not placed a non-cancelled
  // order after the cart was last touched (guest carts cannot be matched, so
  // stale guest carts with items always count).
  const cartUserIds = [
    ...new Set(carts.map((cart) => cart.userId).filter((id): id is string => Boolean(id))),
  ];
  const lastOrders = cartUserIds.length
    ? await db.order.groupBy({
        by: ["userId"],
        where: { userId: { in: cartUserIds }, status: { not: OrderStatuses.Cancelled } },
        _max: { createdAt: true },
      })
    : [];
  const lastOrderAt = new Map<string, Date>();
  for (const row of lastOrders) {
    if (row.userId && row._max.createdAt) lastOrderAt.set(row.userId, row._max.createdAt);
  }

  const abandoned = carts.filter((cart) => {
    if (!cart.items.length) return false;
    const orderedAt = cart.userId ? lastOrderAt.get(cart.userId) : null;
    return !(orderedAt && orderedAt.getTime() > cart.updatedAt.getTime());
  });

  let abandonedValueCents = 0;
  const buckets = { within1h: 0, h1to24: 0, over24h: 0 };
  const productDemand = new Map<string, { name: string; units: number; valueCents: number }>();
  for (const cart of abandoned) {
    const ageMs = now.getTime() - cart.updatedAt.getTime();
    if (ageMs > DAY) buckets.over24h += 1;
    else if (ageMs > HOUR) buckets.h1to24 += 1;
    else buckets.within1h += 1;
    for (const item of cart.items) {
      if (!item.product.active) continue;
      const price = effectivePriceCents(item.product.priceCents, item.product.salePriceCents);
      abandonedValueCents += price * item.quantity;
      const bucket = productDemand.get(item.product.id) ?? {
        name: item.product.name,
        units: 0,
        valueCents: 0,
      };
      bucket.units += item.quantity;
      bucket.valueCents += price * item.quantity;
      productDemand.set(item.product.id, bucket);
    }
  }
  const topAbandonedProducts = [...productDemand.entries()]
    .map(([productId, p]) => ({ productId, ...p }))
    .sort((a, b) => b.units - a.units || b.valueCents - a.valueCents)
    .slice(0, 5);

  const demandProductIds = [
    ...new Set([...wishlists.map((w) => w.productId), ...restockRequests.map((r) => r.productId)]),
  ];
  const demandProducts = demandProductIds.length
    ? await db.product.findMany({
        where: { id: { in: demandProductIds } },
        select: { id: true, name: true, slug: true, stock: true },
      })
    : [];
  const productById = new Map(demandProducts.map((p) => [p.id, p]));

  return {
    // Catalog-wide totals: the demand lists below are capped at the top 8
    // products, so summing them would understate what customers want.
    totals: {
      wishlistSaves,
      restockWaiting,
    },
    abandoned: {
      count: abandoned.length,
      valueCents: abandonedValueCents,
      // Abandoned = untouched for 30+ minutes, so every cart lands in exactly
      // one of these age buckets.
      buckets,
      topProducts: topAbandonedProducts,
    },
    wishlist: wishlists
      .map((w) => {
        const product = productById.get(w.productId);
        return product
          ? { productId: w.productId, name: product.name, slug: product.slug, saves: w._count }
          : null;
      })
      .filter((row): row is NonNullable<typeof row> => row !== null),
    restock: restockRequests
      .map((r) => {
        const product = productById.get(r.productId);
        return product
          ? {
              productId: r.productId,
              name: product.name,
              slug: product.slug,
              stock: product.stock,
              waiting: r._count,
            }
          : null;
      })
      .filter((row): row is NonNullable<typeof row> => row !== null),
    referrals: {
      signups,
      referrers: referrerCount,
      qualifyingOrders: rewards._count,
      rewardCostCents: rewards._sum.rewardCents ?? 0,
      unitRewardCents: storeSettings?.referralRewardCents ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Campaign performance — sales of campaign products within a recent window.
// ---------------------------------------------------------------------------

export async function getCampaignPerformance(currencyCode: string, days = 30, now = new Date()) {
  const since = new Date(now.getTime() - days * DAY);
  const campaigns = await db.campaign.findMany({
    // Campaigns have no end timestamp: switching `active` off is how one ends,
    // so updatedAt stands in for the end date and keeps ended campaigns
    // visible for the reporting window.
    where: { OR: [{ active: true }, { active: false, updatedAt: { gte: since } }] },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      active: true,
      flashSale: true,
      showOnHome: true,
      showInCart: true,
      products: {
        select: {
          offerPriceCents: true,
          product: { select: { id: true, name: true, priceCents: true } },
        },
      },
    },
  });

  const productIds = [...new Set(campaigns.flatMap((c) => c.products.map((p) => p.product.id)))];
  const soldLines = productIds.length
    ? await db.orderItem.findMany({
        where: {
          productId: { in: productIds },
          order: {
            status: { not: OrderStatuses.Cancelled },
            currencyCode,
            createdAt: { gte: since },
          },
        },
        select: { productId: true, quantity: true, priceCents: true },
      })
    : [];
  const soldByProduct = new Map<string, { units: number; valueCents: number }>();
  for (const line of soldLines) {
    const bucket = soldByProduct.get(line.productId) ?? { units: 0, valueCents: 0 };
    bucket.units += line.quantity;
    bucket.valueCents += line.priceCents * line.quantity;
    soldByProduct.set(line.productId, bucket);
  }

  return campaigns.map((campaign) => {
    let units = 0;
    let valueCents = 0;
    let regularValueCents = 0;
    let offerValueCents = 0;
    let discountSum = 0;
    let discountCount = 0;
    for (const cp of campaign.products) {
      const sold = soldByProduct.get(cp.product.id) ?? { units: 0, valueCents: 0 };
      units += sold.units;
      valueCents += sold.valueCents;
      regularValueCents += cp.product.priceCents * sold.units;
      offerValueCents += cp.offerPriceCents * sold.units;
      if (cp.product.priceCents > 0 && cp.offerPriceCents < cp.product.priceCents) {
        discountSum += ((cp.product.priceCents - cp.offerPriceCents) / cp.product.priceCents) * 100;
        discountCount += 1;
      }
    }
    return {
      id: campaign.id,
      title: campaign.title,
      status: campaign.active ? ("active" as const) : ("ended" as const),
      flashSale: campaign.flashSale,
      placement:
        campaign.showOnHome && campaign.showInCart
          ? "Home & cart"
          : campaign.showOnHome
            ? "Home"
            : campaign.showInCart
              ? "Cart"
              : "Inactive placement",
      productCount: campaign.products.length,
      units,
      valueCents,
      regularValueCents,
      offerValueCents,
      discountGivenCents: Math.max(regularValueCents - valueCents, 0),
      avgDiscountPercent: discountCount ? discountSum / discountCount : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Activity trail — merged "who did what when" across the audit sources.
// ---------------------------------------------------------------------------

export type ActivityKind = "order" | "account" | "stock" | "cash";

export type ActivityEntry = {
  id: string;
  kind: ActivityKind;
  at: Date;
  actorName: string;
  actorRole: string;
  summary: string;
  detail: string | null;
  href: string | null;
  amountCents: number | null;
  /** Display label for amountCents — entries carry their own currency, so a
   *  USD settlement or USD order event must not render with the store symbol. */
  currencyLabel: string | null;
};

// Exhaustive by construction: adding an event type without a human-readable
// label here fails typecheck instead of leaking raw enum names to the owner.
const orderEventLabels: Record<(typeof OrderEventTypes)[keyof typeof OrderEventTypes], string> = {
  Placed: "Order placed",
  Processing: "Order processing",
  Confirmed: "Order confirmed",
  Packing: "Packing started",
  Packed: "Order packed",
  CurrencyConfirmed: "Currency confirmed",
  PaymentConfirmed: "Payment confirmed",
  PaymentReviewRequired: "Payment needs review",
  DeliveryAssigned: "Delivery partner assigned",
  Shipped: "Shipped",
  Delivered: "Order delivered",
  Cancelled: "Order cancelled",
  WalletRefunded: "Wallet refund issued",
  CodCollected: "COD cash collected",
  CodRemitted: "COD cash remitted",
  DeliveryAttempted: "Delivery attempt",
  DeliveryProofRecorded: "Delivery proof recorded",
  ReturnRequested: "Return requested",
  ReturnApproved: "Return approved",
  ReturnRejected: "Return rejected",
  ReturnReceived: "Return received",
  ReturnInspected: "Return inspected",
  ReturnResolved: "Return resolved",
  ReturnToOriginStarted: "Return to origin started",
  ReturnToOriginReceived: "Return to origin received",
  CodSettlementRecorded: "COD settlement recorded",
};

export async function getActivityTrail(
  options: { limit?: number; kind?: ActivityKind | "all"; actor?: string } = {},
  now = new Date(),
) {
  const { limit = 50, kind, actor } = options;
  const take = Math.min(Math.max(limit, 1), 100);
  const since = new Date(now.getTime() - 90 * DAY);
  const trimmedActor = actor?.trim();
  const actorNameFilter = trimmedActor
    ? ({ contains: trimmedActor, mode: "insensitive" as const } satisfies Prisma.StringFilter)
    : undefined;
  const want = (k: ActivityKind) => !kind || kind === "all" || kind === k;

  const [orderEvents, accountEvents, adjustments, settlements] = await Promise.all([
    want("order")
      ? db.orderEvent.findMany({
          where: {
            createdAt: { gte: since },
            ...(actorNameFilter ? { actorName: actorNameFilter } : {}),
          },
          include: {
            order: { select: { number: true, currencyCode: true, currencySymbol: true } },
          },
          orderBy: { createdAt: "desc" },
          take,
        })
      : Promise.resolve([]),
    want("account")
      ? db.accountStatusEvent.findMany({
          where: {
            createdAt: { gte: since },
            ...(actorNameFilter ? { actorName: actorNameFilter } : {}),
          },
          orderBy: { createdAt: "desc" },
          take,
        })
      : Promise.resolve([]),
    want("stock")
      ? db.inventoryAdjustment.findMany({
          where: {
            createdAt: { gte: since },
            ...(actorNameFilter ? { actorName: actorNameFilter } : {}),
          },
          include: { product: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take,
        })
      : Promise.resolve([]),
    want("cash")
      ? db.codSettlement.findMany({
          where: {
            receivedAt: { gte: since },
            ...(trimmedActor ? { receivedByName: actorNameFilter } : {}),
          },
          orderBy: { receivedAt: "desc" },
          take,
        })
      : Promise.resolve([]),
  ]);

  const entries: ActivityEntry[] = [
    ...orderEvents.map((event) => ({
      id: `order-${event.id}`,
      kind: "order" as const,
      at: event.createdAt,
      actorName: event.actorName,
      actorRole: event.actorRole,
      summary: orderEventLabels[event.type] ?? event.type,
      detail: event.message,
      href: `/admin/orders/${event.order.number}`,
      amountCents: event.amountCents,
      currencyLabel: event.amountCents === null ? null : orderCurrencyLabel(event.order),
    })),
    ...accountEvents.map((event) => ({
      id: `account-${event.id}`,
      kind: "account" as const,
      at: event.createdAt,
      actorName: event.actorName,
      actorRole: "admin",
      summary: event.active ? "Account activated" : "Account suspended",
      detail: event.userId ? "Customer or staff account" : "Delivery partner account",
      href: "/admin/users",
      amountCents: null,
      currencyLabel: null,
    })),
    ...adjustments.map((event) => ({
      id: `stock-${event.id}`,
      kind: "stock" as const,
      at: event.createdAt,
      actorName: event.actorName,
      actorRole: "stock",
      summary: `Stock ${event.delta >= 0 ? "+" : ""}${event.delta} · ${event.product.name}`,
      detail: event.reason,
      href: `/admin/products/${event.productId}`,
      amountCents: null,
      currencyLabel: null,
    })),
    ...settlements.map((event) => ({
      id: `cash-${event.id}`,
      kind: "cash" as const,
      at: event.receivedAt,
      actorName: event.receivedByName,
      actorRole: "finance",
      summary: `COD settlement ${event.reference}`,
      detail: `${event.courierName ?? "Mixed / legacy batch"} · ${event.currencyCode}${
        event.varianceCents !== 0
          ? ` · variance ${event.varianceCents > 0 ? "+" : ""}${formatPrice(event.varianceCents, `${event.currencyCode} `)}`
          : ""
      }`,
      href: "/admin/reconciliation",
      amountCents: event.receivedCents,
      currencyLabel: `${event.currencyCode} `,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, take);

  return entries;
}
