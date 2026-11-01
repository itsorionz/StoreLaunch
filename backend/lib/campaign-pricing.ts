import type { Prisma } from "@backend/generated/prisma/client";

export const campaignPriceSelect = {
  where: { campaign: { active: true } },
  select: { offerPriceCents: true, campaign: { select: { flashSale: true } } },
} as const;

type PricedProduct = {
  priceCents: number;
  salePriceCents: number | null;
  flashSale?: boolean;
  campaignOffers: { offerPriceCents: number; campaign: { flashSale: boolean } }[];
};

/** Offers never stack; ignore obsolete offers above a newly reduced regular price. */
export function withCampaignPrice<T extends PricedProduct>(product: T): T {
  const valid = product.campaignOffers.filter(
    (offer) => offer.offerPriceCents > 0 && offer.offerPriceCents < product.priceCents,
  );
  const prices = valid.map((offer) => offer.offerPriceCents);
  if (
    product.salePriceCents !== null &&
    product.salePriceCents > 0 &&
    product.salePriceCents < product.priceCents
  )
    prices.push(product.salePriceCents);
  return {
    ...product,
    salePriceCents: prices.length ? Math.min(...prices) : null,
    ...(product.flashSale !== undefined
      ? { flashSale: product.flashSale || valid.some((offer) => offer.campaign.flashSale) }
      : {}),
  };
}

export async function lockCampaignPricing(tx: Prisma.TransactionClient, shared = false) {
  if (shared)
    await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtext('campaign-pricing'))::text`;
  else await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('campaign-pricing'))::text`;
}
