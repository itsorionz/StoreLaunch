"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../lib/session";
import { adjustInventory, type InventoryResult } from "../lib/inventory";
import { revalidateStore } from "../lib/revalidate";
import { logger } from "../lib/logger";

const log = logger.child({ scope: "action:inventory" });

export async function adjustProductStock(
  _previous: InventoryResult | null,
  form: FormData,
): Promise<InventoryResult> {
  const admin = await requireAdmin();
  let result: InventoryResult;
  try {
    result = await adjustInventory(admin.id, Object.fromEntries(form.entries()));
  } catch (error) {
    // The operator only sees a generic retry message; the real cause
    // (stock race, validation, database failure) is recorded here.
    log.error("adjustProductStock failed", { error, adminId: admin.id });
    return {
      ok: false,
      error: "Stock could not be adjusted. Retry the same request or refresh to review stock",
    };
  }
  if (result.ok) {
    revalidateStore();
    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${form.get("productId")}`);
    if (!result.replayed && result.previousStock === 0 && (result.newStock ?? 0) > 0) {
      const { notifyBackInStock } = await import("../lib/notify");
      await notifyBackInStock(String(form.get("productId")));
    }
  }
  return result;
}
