"use server";

import { recordId } from "../lib/form-validation";

import { revalidatePath } from "next/cache";
import { db } from "../lib/db";
import { getCurrentUser } from "../lib/session";

export type WishlistActionResult = { ok: boolean; error?: string; on?: boolean };

export async function toggleWishlist(productId: string): Promise<WishlistActionResult> {
  if (!recordId.safeParse(productId).success)
    return { ok: false, error: "Invalid record. Refresh the page and try again" };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to save items" };

  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) return { ok: false, error: "Product not found" };

  const existing = await db.wishlist.findUnique({
    where: { userId_productId: { userId: user.id, productId } },
  });

  if (existing) {
    await db.wishlist.delete({ where: { id: existing.id } });
    revalidatePath("/account/wishlists");
    revalidatePath("/products");
    return { ok: true, on: false };
  }

  await db.wishlist.create({ data: { userId: user.id, productId } });
  revalidatePath("/account/wishlists");
  return { ok: true, on: true };
}
