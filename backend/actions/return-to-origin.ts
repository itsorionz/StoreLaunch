"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Roles, ReturnDispositions } from "@backend/lib/enums.mjs";
import { requireAdmin } from "@backend/lib/session";
import { recordId, validationFailure } from "@backend/lib/form-validation";
import { completeReturnToOrigin, startReturnToOrigin } from "@backend/lib/return-to-origin";

export type ReturnToOriginActionState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
} | null;
const startSchema = z.object({
  orderId: recordId,
  reason: z.string().trim().min(5, "Explain why the delivery is returning").max(500),
});
const receiveSchema = z.object({
  orderId: recordId,
  externalReference: z.string().trim().max(100).optional().default(""),
  disposition: z.enum([
    ReturnDispositions.Resellable,
    ReturnDispositions.Damaged,
    ReturnDispositions.WriteOff,
  ]),
  conditionNote: z.string().trim().min(5, "Describe the returned parcel condition").max(500),
});

function refresh(orderNumber: string) {
  for (const path of [
    "/admin",
    "/admin/orders",
    "/admin/returns",
    `/admin/orders/${orderNumber}`,
    "/account/orders",
    `/account/orders/${orderNumber}`,
    "/rider",
    "/rider/route",
    "/rider/history",
  ])
    revalidatePath(path);
}

export async function startReturnToOriginAction(
  _previous: ReturnToOriginActionState,
  form: FormData,
): Promise<ReturnToOriginActionState> {
  const admin = await requireAdmin();
  const parsed = startSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return validationFailure(parsed.error);
  const result = await startReturnToOrigin(parsed.data.orderId, parsed.data.reason, {
    id: admin.id,
    name: admin.name ?? "Admin",
    role: Roles.Admin,
  });
  if (!result.ok || !result.number)
    return { error: result.error ?? "Could not start return-to-origin" };
  refresh(result.number);
  return { ok: true };
}

export async function completeReturnToOriginAction(
  _previous: ReturnToOriginActionState,
  form: FormData,
): Promise<ReturnToOriginActionState> {
  const admin = await requireAdmin();
  const parsed = receiveSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return validationFailure(parsed.error);
  const result = await completeReturnToOrigin(
    parsed.data.orderId,
    parsed.data.externalReference,
    parsed.data.disposition,
    parsed.data.conditionNote,
    { id: admin.id, name: admin.name ?? "Admin", role: Roles.Admin },
  );
  if (!result.ok || !result.number)
    return { error: result.error ?? "Could not confirm return receipt" };
  refresh(result.number);
  return { ok: true };
}
