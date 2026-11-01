"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "../lib/db";
import { requireAdmin } from "../lib/session";
import { Roles } from "../lib/enums.mjs";
import { shortText } from "../lib/form-validation";
import { userTextWhere } from "../lib/search-filters";
import { savePromotionDraft, sendPromotionToCustomers } from "../lib/promotions";

export type PromotionActionResult = {
  ok: boolean;
  id?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  count?: number;
  alreadySent?: boolean;
} | null;

export async function savePromotion(
  _previous: PromotionActionResult,
  data: FormData,
): Promise<PromotionActionResult> {
  const admin = await requireAdmin();
  const result = await savePromotionDraft(admin.id, {
    ...Object.fromEntries(data),
    selectedUserIds: data.getAll("selectedUserIds"),
  });
  if (result.ok) revalidatePath("/admin/promotions", "layout");
  return result;
}

export async function sendPromotion(
  _previous: PromotionActionResult,
  data: FormData,
): Promise<PromotionActionResult> {
  const admin = await requireAdmin();
  const result = await sendPromotionToCustomers(admin.id, String(data.get("id") ?? ""));
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function findPromotionCustomers(query: string) {
  await requireAdmin();
  const parsed = z.string().pipe(shortText).safeParse(query);
  if (!parsed.success) return { error: "Search must be at most 200 characters", customers: [] };
  const customers = await db.user.findMany({
    where: { active: true, roles: { has: Roles.Customer }, ...userTextWhere(parsed.data) },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 30,
    select: { id: true, name: true, email: true, phone: true },
  });
  return { customers };
}
