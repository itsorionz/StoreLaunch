"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, requireAdmin } from "../lib/session";
import { Roles } from "../lib/enums.mjs";
import {
  createAfterSalesRequest,
  reviewAfterSales,
  receiveAfterSales,
  inspectAndResolveAfterSales,
  resolveCancellation,
} from "../lib/after-sales";
import { revalidateStore } from "../lib/revalidate";

export type AfterSalesActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  requestId?: string;
} | null;
function entries(form: FormData, prefix: string) {
  return [...form.entries()]
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, value]) => `${key.slice(prefix.length)}:${String(value)}`);
}
function refresh(orderNumber?: string) {
  revalidatePath("/admin/returns");
  revalidatePath("/admin/orders");
  revalidatePath("/account/orders");
  revalidateStore();
  if (orderNumber) {
    revalidatePath(`/admin/orders/${orderNumber}`);
    revalidatePath(`/account/orders/${orderNumber}`);
  }
}

export async function submitAfterSales(
  _state: AfterSalesActionState,
  form: FormData,
): Promise<AfterSalesActionState> {
  const user = await getCurrentUser();
  if (!user || user.role !== Roles.Customer)
    return { ok: false, error: "Sign in with your customer account" };
  const kind = String(form.get("kind") ?? "");
  const result = await createAfterSalesRequest(user.id, {
    orderId: form.get("orderId"),
    kind,
    reason: form.get("reason"),
    note: form.get("note"),
    items: entries(form, "item:"),
  });
  if (result.ok) refresh();
  return result;
}

export async function reviewAfterSalesAction(
  _state: AfterSalesActionState,
  form: FormData,
): Promise<AfterSalesActionState> {
  const admin = await requireAdmin();
  const result = await reviewAfterSales(
    { id: admin.id, name: admin.name ?? "Admin", role: Roles.Admin },
    {
      requestId: form.get("requestId"),
      decision: form.get("decision"),
      adminNote: form.get("adminNote"),
      approvedItems: entries(form, "approved:"),
    },
  );
  if (result.ok) refresh();
  return result;
}

export async function receiveAfterSalesAction(
  _state: AfterSalesActionState,
  form: FormData,
): Promise<AfterSalesActionState> {
  const admin = await requireAdmin();
  const result = await receiveAfterSales(
    { id: admin.id, name: admin.name ?? "Admin", role: Roles.Admin },
    {
      requestId: form.get("requestId"),
      conditionNote: form.get("conditionNote"),
      receivedItems: entries(form, "received:"),
    },
  );
  if (result.ok) refresh();
  return result;
}

export async function inspectAfterSalesAction(
  _state: AfterSalesActionState,
  form: FormData,
): Promise<AfterSalesActionState> {
  const admin = await requireAdmin();
  const result = await inspectAndResolveAfterSales(
    { id: admin.id, name: admin.name ?? "Admin", role: Roles.Admin },
    {
      requestId: form.get("requestId"),
      externalReference: form.get("externalReference"),
      inspectedItems: entries(form, "disposition:"),
    },
  );
  if (result.ok) refresh();
  return result;
}

export async function resolveCancellationAction(
  _state: AfterSalesActionState,
  form: FormData,
): Promise<AfterSalesActionState> {
  const admin = await requireAdmin();
  const result = await resolveCancellation(
    { id: admin.id, name: admin.name ?? "Admin", role: Roles.Admin },
    String(form.get("requestId") ?? ""),
    String(form.get("externalReference") ?? ""),
  );
  if (result.ok) refresh();
  return result;
}
