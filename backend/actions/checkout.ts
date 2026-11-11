"use server";

import { PaymentMethods } from "@backend/lib/enums.mjs";
import {
  personName,
  phoneNumber,
  addressLine,
  shortText,
  emailAddress,
  moneyAmount,
  validationFailure,
} from "../lib/form-validation";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCheckoutCart } from "../lib/cart";
import { getCurrentUser } from "../lib/session";
import { getStoreSettings } from "../lib/settings";
import { effectivePriceCents } from "../lib/money";
import { resumeOrderPayment } from "../lib/payment-recovery";
import { createReservedOrder } from "../lib/order-placement";
import { updateTag } from "next/cache";
import { db } from "../lib/db";
import { revalidateStore } from "../lib/revalidate";
import { logger } from "../lib/logger";

const log = logger.child({ scope: "action:checkout" });

const checkoutSchema = z.object({
  name: personName,
  additionalInfo: z
    .string()
    .trim()
    .max(1000, "Additional info must be 1,000 characters or fewer")
    .optional()
    .default(""),
  phone: phoneNumber,
  line1: addressLine,
  line2: shortText.optional(),
  city: shortText.min(2, "Enter your city"),
  region: shortText.optional(),
  postal: shortText.optional(),
  email: emailAddress.optional().or(z.literal("")),
  walletCents: moneyAmount.default(0),
  paymentMethod: z
    .enum([PaymentMethods.COD, PaymentMethods.GATEWAY])
    .default(PaymentMethods.GATEWAY),
});

export type CheckoutState = { error?: string; fieldErrors?: Record<string, string[]> } | null;

export async function placeOrder(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/checkout");

  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ...validationFailure(parsed.error) };
  }
  const d = parsed.data;

  const [cart, settings] = await Promise.all([getCheckoutCart(), getStoreSettings()]);
  if (!cart || !cart.items.length) return { error: "Your cart is empty" };

  const forPurchase = cart.items;
  if (forPurchase.some((i) => i.product.stock < i.quantity))
    return { error: "Some items are unavailable. Please review your cart" };

  const subtotalCents = forPurchase.reduce(
    (s, i) => s + effectivePriceCents(i.product.priceCents, i.product.salePriceCents) * i.quantity,
    0,
  );
  const zones = await db.deliveryZone.findMany({ where: { active: true } });
  const haystack = [d.city, d.region].filter(Boolean).map((s) => s!.toLowerCase());
  const matched = zones.find((z) =>
    z.areas.some((a) =>
      haystack.some((h) => h.includes(a.toLowerCase()) || a.toLowerCase().includes(h)),
    ),
  );
  const shippingCents = matched
    ? subtotalCents >= (matched.freeOverCents ?? Infinity)
      ? 0
      : matched.rateCents
    : subtotalCents >= (settings.freeShippingOverCents ?? Infinity)
      ? 0
      : settings.deliveryFeeCents;
  const codFeeCents = matched ? matched.codFeeCents : 0;
  const totalCents =
    subtotalCents + shippingCents + (d.paymentMethod === PaymentMethods.COD ? codFeeCents : 0);

  const requestedWallet = Math.max(0, Math.min(d.walletCents, totalCents));

  let order;
  try {
    order = await createReservedOrder({
      userId: user.id,
      cart,
      shippingCents,
      zoneId: matched?.id,
      zoneRateCents: matched?.rateCents,
      zoneCodFeeCents: matched?.codFeeCents,
      walletCents: requestedWallet,
      currencyCode: settings.currencyCode,
      currencySymbol: settings.currencySymbol,
      actor: {
        id: user.id,
        name: user.name ?? "Customer",
        role: user.role as "Customer" | "Admin" | "Rider" | "Support",
      },
      paymentMethod: d.paymentMethod,
      recipientName: d.name,
      phone: d.phone,
      line1: d.line1,
      line2: d.line2,
      city: d.city,
      region: d.region,
      postal: d.postal,
      additionalInfo: d.additionalInfo,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // Expected business outcomes: the customer gets a specific message, so a
    // warn line is enough to reconstruct what happened. Anything else is a
    // real failure and keeps its stack.
    const expected = [
      "OUT_OF_STOCK",
      "CART_CHANGED",
      "INSUFFICIENT_WALLET",
      "CURRENCY_CHANGED",
      "HUB_AT_CAPACITY",
      "INVALID_ORDER_AMOUNT",
      "INVALID_WALLET_AMOUNT",
      "ORDER_AMOUNT_LIMIT",
    ].includes(message);
    if (expected) log.warn("placeOrder rejected", { code: message, userId: user.id });
    else
      log.error("placeOrder failed", {
        error,
        userId: user.id,
        subtotalCents,
        paymentMethod: d.paymentMethod,
      });
    if (["OUT_OF_STOCK", "CART_CHANGED"].includes(message))
      return { error: "Your cart or product availability changed. Please review your cart" };
    if (message === "INSUFFICIENT_WALLET")
      return { error: "Your wallet balance changed. Please review the payment amount" };
    if (message === "CURRENCY_CHANGED")
      return { error: "Store currency changed. Refresh checkout to review current prices" };
    if (message === "HUB_AT_CAPACITY")
      return {
        error:
          "The delivery point for your area reached today's capacity. Try again tomorrow or contact the store",
      };
    if (["INVALID_ORDER_AMOUNT", "INVALID_WALLET_AMOUNT", "ORDER_AMOUNT_LIMIT"].includes(message))
      return {
        error:
          "This order exceeds the supported amount or contains an invalid price. Reduce the quantity or contact the store",
      };
    throw error;
  }
  updateTag("cart-count");
  updateTag("wallet");
  revalidateStore();
  const walletUsed = order.walletPaidCents;

  const remainingCents = totalCents - walletUsed;

  // Wallet is deducted FIRST. If it covers everything, mark PAID immediately.
  if (remainingCents <= 0) {
    redirect(`/order/${order.number}/result?wallet=1`);
  }

  // Cash on Delivery: remainder is collected on delivery — no gateway call.
  if (d.paymentMethod === PaymentMethods.COD) {
    redirect(`/order/${order.number}/result?cod=1`);
  }

  const payment = await resumeOrderPayment(order.id);
  updateTag("wallet");
  revalidateStore();
  if (payment.gatewayUrl) redirect(payment.gatewayUrl);
  redirect(`/account/orders/${order.number}`);
}
