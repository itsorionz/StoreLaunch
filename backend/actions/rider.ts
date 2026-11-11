"use server";

import { OrderStatuses, PaymentMethods, Roles } from "@backend/lib/enums.mjs";
import { recordId } from "../lib/form-validation";

import { revalidatePath, updateTag } from "next/cache";
import { transitionOrder } from "../lib/order-lifecycle";
import { getRider } from "../lib/session";
import { redirect } from "next/navigation";
import { db } from "../lib/db";
import { fieldFailure, validationFailure } from "../lib/form-validation";
import {
  attemptSchema,
  proofSchema,
  recordDeliveryAttempt,
  completeRiderDelivery,
} from "../lib/rider-delivery";
import { saveProofPhoto, discardProofPhoto } from "../lib/delivery-photo";
import { logger } from "../lib/logger";

const log = logger.child({ scope: "action:rider" });

export type RiderActionResult = { ok: boolean; error?: string };

export async function riderUpdateStatus(
  orderId: string,
  status: typeof OrderStatuses.Shipped | typeof OrderStatuses.Delivered,
  cashCollected = false,
): Promise<RiderActionResult> {
  if (!recordId.safeParse(orderId).success)
    return { ok: false, error: "Invalid record. Refresh the page and try again" };
  const ctx = await getRider();
  if (!ctx) return { ok: false, error: "Sign in as a rider" };
  if (!ctx.rider.active) return { ok: false, error: "Your rider account is inactive" };

  if (status !== OrderStatuses.Shipped && status !== OrderStatuses.Delivered)
    return { ok: false, error: "Invalid delivery status" };
  if (status === OrderStatuses.Delivered)
    return {
      ok: false,
      error: "Open Proof of delivery to confirm the handover and cash collection",
    };
  const result = await transitionOrder(orderId, status, {
    riderId: ctx.rider.id,
    cashCollected: cashCollected === true,
    actor: { id: ctx.user.id, name: ctx.user.name ?? ctx.rider.name, role: Roles.Rider },
  });
  if (!result.ok) return result;

  revalidatePath("/rider");
  revalidatePath("/rider/route");
  revalidatePath("/rider/history");
  revalidatePath("/rider/cash");
  revalidatePath(`/rider/orders/${result.number}`);
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${result.number}`);
  revalidatePath(`/account/orders/${result.number}`);
  return { ok: true };
}

export type RiderFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
} | null;
function refreshDelivery(number: string) {
  updateTag("wallet");
  revalidatePath("/account/refer");
  revalidatePath("/account/inbox");
  for (const route of [
    "/rider",
    "/rider/route",
    "/rider/cash",
    "/rider/history",
    "/admin",
    "/admin/orders",
    `/admin/orders/${number}`,
    `/account/orders/${number}`,
    `/rider/orders/${number}`,
  ])
    revalidatePath(route);
}
export async function saveDeliveryAttempt(
  _previous: RiderFormState,
  form: FormData,
): Promise<RiderFormState> {
  const ctx = await getRider();
  if (!ctx) return { error: "Sign in as an active rider" };
  const parsed = attemptSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return validationFailure(parsed.error);
  const result = await recordDeliveryAttempt(ctx.user.id, parsed.data);
  if (!result.ok || !result.number) return result;
  refreshDelivery(result.number);
  redirect(`/rider/orders/${result.number}`);
}
export async function saveDeliveryProof(
  _previous: RiderFormState,
  form: FormData,
): Promise<RiderFormState> {
  const ctx = await getRider();
  if (!ctx) return { error: "Sign in as an active rider" };
  const parsed = proofSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return validationFailure(parsed.error);
  const order = await db.order.findFirst({
    where: { id: parsed.data.orderId, riderId: ctx.rider.id, status: OrderStatuses.Shipped },
  });
  if (!order) return { error: "This delivery changed. Open your delivery list again" };
  if (
    order.paymentMethod === PaymentMethods.COD &&
    order.totalCents > order.walletPaidCents &&
    !parsed.data.cashCollected
  )
    return fieldFailure(
      "cashCollected",
      "Confirm full cash collection before completing this COD delivery",
    );
  let photo: Awaited<ReturnType<typeof saveProofPhoto>>;
  try {
    photo = await saveProofPhoto(form.get("photo"));
  } catch (error) {
    log.warn("saveDeliveryProof photo rejected", { error, orderId: parsed.data.orderId });
    return fieldFailure("photo", error instanceof Error ? error.message : "Could not save photo");
  }
  let result;
  try {
    result = await completeRiderDelivery(ctx.user.id, parsed.data, photo);
  } catch (error) {
    // The proof photo is discarded and the rider sees a generic message, so
    // without this line the real cause of a failed delivery would be lost.
    log.error("saveDeliveryProof failed", {
      error,
      orderId: parsed.data.orderId,
      riderId: ctx.user.id,
    });
    await discardProofPhoto(photo.photoKey);
    return { error: "Delivery could not be saved. Refresh and try again" };
  }
  if (!result.ok) {
    await discardProofPhoto(photo.photoKey);
    return result;
  }
  refreshDelivery(result.number);
  redirect(`/rider/orders/${result.number}`);
}
