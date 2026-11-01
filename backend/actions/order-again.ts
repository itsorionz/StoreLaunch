"use server";

import { updateTag, revalidatePath } from "next/cache";
import { getCurrentUser } from "../lib/session";
import { recordId } from "../lib/form-validation";
import { restoreOrderItems } from "../lib/order-again";

export type OrderAgainState = {
  ok: boolean;
  error?: string;
  message?: string;
  warnings?: string[];
} | null;
export async function orderAgain(
  _previous: OrderAgainState,
  form: FormData,
): Promise<OrderAgainState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to order again" };
  const id = recordId.safeParse(form.get("orderId"));
  if (!id.success) return { ok: false, error: "Invalid order. Refresh and try again" };
  const result = await restoreOrderItems(user.id, id.data);
  if (result.ok) {
    updateTag("cart-count");
    revalidatePath("/cart");
  }
  return result;
}
