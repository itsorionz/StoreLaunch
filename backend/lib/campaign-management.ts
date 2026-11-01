import "server-only";
import { z } from "zod";
import { db } from "./db";
import { recordId, validationFailure, fieldFailure } from "./form-validation";
import { lockCampaignPricing } from "./campaign-pricing";
import { CampaignDiscountModes } from "./campaign-constants";

const schema = z
  .object({
    campaignId: recordId,
    productIds: z
      .array(recordId)
      .min(1, "Select at least one product")
      .max(100, "Select at most 100 products at a time"),
    mode: z.enum(CampaignDiscountModes),
    amount: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, "Enter a positive amount with at most two decimal places")
      .transform(Number)
      .refine((n) => n > 0 && n <= 10000000, "Enter an amount greater than zero"),
  })
  .refine((d) => d.mode !== CampaignDiscountModes.Percentage || d.amount < 100, {
    path: ["amount"],
    message: "Discount must be greater than 0 and below 100%",
  });

export async function saveCampaignProducts(input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const { campaignId, mode, amount } = parsed.data;
  const productIds = [...new Set(parsed.data.productIds)].sort();
  return db.$transaction(async (tx) => {
    await lockCampaignPricing(tx);
    if (!(await tx.campaign.findUnique({ where: { id: campaignId } })))
      return { ok: false, ...fieldFailure("campaignId", "Campaign no longer exists") };
    // Lock products in the same order as checkout, so prices cannot change during validation.
    for (const id of productIds)
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${id} FOR UPDATE`;
    const products = await tx.product.findMany({ where: { id: { in: productIds } } });
    if (products.length !== productIds.length)
      return {
        ok: false,
        ...fieldFailure(
          "productIds",
          "One or more products no longer exist. Refresh and try again",
        ),
      };
    const offers = products.map((product) => ({
      product,
      price:
        mode === CampaignDiscountModes.Percentage
          ? Math.round(product.priceCents * (1 - amount / 100))
          : Math.round(amount * 100),
    }));
    const invalid = offers.find(({ product, price }) => price <= 0 || price >= product.priceCents);
    if (invalid)
      return {
        ok: false,
        ...fieldFailure(
          "amount",
          `Offer price for ${invalid.product.name} must be greater than zero and below its regular price`,
        ),
      };
    for (const { product, price } of offers)
      await tx.campaignProduct.upsert({
        where: { campaignId_productId: { campaignId, productId: product.id } },
        create: { campaignId, productId: product.id, offerPriceCents: price },
        update: { offerPriceCents: price },
      });
    return { ok: true };
  });
}

export async function removeCampaignProduct(campaignId: string, productId: string) {
  if (!recordId.safeParse(campaignId).success || !recordId.safeParse(productId).success)
    return { ok: false, error: "Choose a valid campaign and product" };
  await db.$transaction(async (tx) => {
    await lockCampaignPricing(tx);
    await tx.campaignProduct.deleteMany({ where: { campaignId, productId } });
  });
  return { ok: true };
}
