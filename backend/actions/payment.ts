"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { db } from "../lib/db";
import { getCurrentUser } from "../lib/session";
import { Roles } from "../lib/enums.mjs";
import { resumeOrderPayment, recoverOrderPayment } from "../lib/payment-recovery";
import { revalidateStore } from "../lib/revalidate";

const inputSchema = z.object({
  orderId: z.string().min(1).max(100),
  operation: z.enum(["Resume", "Check"]),
});
export async function manageOrderPayment(
  _state: { message: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  const parsed = inputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Choose a valid payment action" };
  const user = await getCurrentUser();
  if (!user || user.role === Roles.Rider)
    return { ok: false, message: "Sign in with your customer or administrator account" };
  const { orderId, operation } = parsed.data;
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { userId: true, number: true },
  });
  if (!order || (order.userId !== user.id && (user.role !== Roles.Admin || operation !== "Check")))
    return { ok: false, message: "Order not found" };
  const result =
    operation === "Resume" ? await resumeOrderPayment(orderId) : await recoverOrderPayment(orderId);
  updateTag("wallet");
  revalidateStore();
  revalidatePath(`/account/orders/${order.number}`);
  revalidatePath(`/admin/orders/${order.number}`);
  revalidatePath("/admin/payments");
  if (result.gatewayUrl) redirect(result.gatewayUrl);
  return { ok: result.ok, message: result.message };
}
