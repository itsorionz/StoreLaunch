"use server";

import { revalidatePath } from "next/cache";
import type { AdminActionResult } from "./admin";
import { requireAdmin } from "../lib/session";
import { db } from "../lib/db";

function refresh() {
  revalidatePath("/admin/delivery-hubs");
  revalidatePath("/admin/delivery-zones");
}

/** Creates or updates a delivery hub (pickup point). `id` present = update. */
export async function saveDeliveryHub(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") || "").trim() || undefined;
  const name = String(formData.get("name") || "").trim();
  const code = String(formData.get("code") || "").trim();
  if (!name || !code) return { ok: false, error: "Name and code required" };

  const capacityRaw = String(formData.get("capacity") || "").trim();
  let capacity: number | null = null;
  if (capacityRaw) {
    capacity = Number(capacityRaw);
    if (!Number.isInteger(capacity) || capacity < 1)
      return { ok: false, error: "Capacity must be a whole number of at least 1" };
  }

  const warehouseId = String(formData.get("warehouseId") || "").trim() || null;
  if (warehouseId && !(await db.warehouse.findUnique({ where: { id: warehouseId } })))
    return { ok: false, error: "Selected warehouse no longer exists" };

  const duplicate = await db.deliveryHub.findFirst({
    where: { code, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  });
  if (duplicate) return { ok: false, error: "Hub code already exists" };

  const data = {
    name,
    code,
    address: String(formData.get("address") || "").trim() || null,
    city: String(formData.get("city") || "").trim() || null,
    region: String(formData.get("region") || "").trim() || null,
    warehouseId,
    capacity,
    isDefault: formData.get("isDefault") === "on",
    active: formData.get("active") === "on",
  };
  if (id) await db.deliveryHub.update({ where: { id }, data });
  else await db.deliveryHub.create({ data });
  refresh();
  return { ok: true };
}

export async function toggleDeliveryHub(
  _prev: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") || "").trim();
  const active = formData.get("active") === "true";
  if (!id) return { ok: false, error: "ID required" };

  await db.deliveryHub.update({ where: { id }, data: { active } });
  refresh();
  return { ok: true };
}
