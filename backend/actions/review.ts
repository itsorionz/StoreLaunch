"use server";

import { OrderStatuses, ReviewStatuses } from "@backend/lib/enums.mjs";
import { recordId, validationFailure } from "../lib/form-validation";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { db } from "../lib/db";
import { getCurrentUser } from "../lib/session";
import { logEmail } from "../lib/mail";

export type ReviewFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

const reviewSchema = z.object({
  productId: recordId,
  rating: z.coerce
    .number()
    .int("Choose a whole star rating")
    .min(1, "Choose 1 to 5 stars")
    .max(5, "Choose 1 to 5 stars"),
  body: z.string().trim().max(2000, "Use at most 2000 characters"),
});

export async function submitReview(
  prev: ReviewFormState | null,
  formData: FormData,
): Promise<ReviewFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to write a review" };

  const parsed = reviewSchema.safeParse({
    productId: formData.get("productId"),
    rating: formData.get("rating"),
    body: formData.get("body") ?? "",
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { productId, rating, body } = parsed.data;

  const purchases = await db.orderItem.count({
    where: { productId, order: { userId: user.id, status: { not: OrderStatuses.Cancelled } } },
  });
  if (purchases === 0) return { error: "You can only review products you purchased" };

  const product = await db.product.findUnique({ where: { id: productId }, select: { slug: true } });
  if (!product) return { error: "Product not found" };

  const existing = await db.review.findUnique({
    where: { productId_userId: { productId, userId: user.id } },
    select: { id: true },
  });

  if (existing) {
    await db.review.update({
      where: { id: existing.id },
      data: { rating, body, status: ReviewStatuses.Pending },
    });
  } else {
    await db.review.create({
      data: { productId, userId: user.id, rating, body, status: ReviewStatuses.Pending },
    });
  }

  updateTag("products");
  revalidatePath("/admin/reviews");
  revalidatePath("/account/rate");
  revalidatePath("/account/reviews");
  revalidatePath(`/products/${product.slug}`);
  return { ok: true };
}

const riderReviewSchema = z.object({
  orderId: recordId,
  rating: z.coerce
    .number()
    .int("Choose a whole star rating")
    .min(1, "Choose 1 to 5 stars")
    .max(5, "Choose 1 to 5 stars"),
  body: z.string().trim().max(2000, "Use at most 2000 characters"),
});

export async function submitRiderReview(
  prev: ReviewFormState | null,
  formData: FormData,
): Promise<ReviewFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to write a review" };

  const parsed = riderReviewSchema.safeParse({
    orderId: formData.get("orderId"),
    rating: formData.get("rating"),
    body: formData.get("body") ?? "",
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { orderId, rating, body } = parsed.data;

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, number: true, userId: true, riderId: true },
  });
  if (!order || order.userId !== user.id) return { error: "Order not found" };
  if (!order.riderId) return { error: "No rider was assigned to this order" };

  const existing = await db.riderReview.findUnique({ where: { orderId }, select: { id: true } });

  if (existing) {
    await db.riderReview.update({ where: { id: existing.id }, data: { rating, body } });
  } else {
    await db.riderReview.create({ data: { orderId, userId: user.id, rating, body } });
    const settings = await db.storeSettings.findFirst({ select: { contactEmail: true } });
    await logEmail({
      to: settings?.contactEmail || user.email,
      subject: `Rider review for order ${order.number}`,
      body: `From: ${user.name} <${user.email}>\nOrder: ${order.number}\nRating: ${rating}/5\n\n${body}`,
    });
  }

  revalidatePath("/account/rider-review");
  return { ok: true };
}
