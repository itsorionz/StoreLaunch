"use server";

import { requireAdmin } from "../lib/session";
import { saveCampaignProducts, removeCampaignProduct } from "../lib/campaign-management";
import { revalidateStore } from "../lib/revalidate";
import { revalidatePath } from "next/cache";
import type { AdminActionResult } from "./admin";

export async function saveCampaignOffers(
  _previous: AdminActionResult | null,
  data: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const result = await saveCampaignProducts({
    campaignId: data.get("campaignId"),
    productIds: data.getAll("productIds"),
    mode: data.get("mode"),
    amount: data.get("amount"),
  });
  if (result.ok) {
    revalidateStore();
    revalidatePath("/admin/campaigns", "layout");
  }
  return result;
}

export async function deleteCampaignOffer(
  _previous: AdminActionResult | null,
  data: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const result = await removeCampaignProduct(
    String(data.get("campaignId") ?? ""),
    String(data.get("productId") ?? ""),
  );
  if (result.ok) {
    revalidateStore();
    revalidatePath("/admin/campaigns", "layout");
  }
  return result;
}
