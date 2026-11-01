"use server";

import { recordId } from "../lib/form-validation";

import { revalidatePath } from "next/cache";
import { db } from "../lib/db";
import { getCurrentUser } from "../lib/session";

export type NotifyActionResult = { ok: boolean; error?: string; enabled?: boolean };

export async function toggleStockNotification(productId: string): Promise<NotifyActionResult> {
  if (!recordId.safeParse(productId).success)
    return { ok: false, error: "Invalid record. Refresh the page and try again" };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to get notified" };

  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) return { ok: false, error: "Product not found" };

  const existing = await db.stockNotification.findUnique({
    where: { userId_productId: { userId: user.id, productId } },
  });

  if (existing) {
    await db.stockNotification.delete({ where: { id: existing.id } });
    revalidatePath("/account/notifications");
    return { ok: true, enabled: false };
  }

  await db.stockNotification.create({ data: { userId: user.id, productId } });
  revalidatePath("/account/notifications");
  return { ok: true, enabled: true };
}
