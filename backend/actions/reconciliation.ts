"use server";

import { CodSettlementMethods, Roles } from "@backend/lib/enums.mjs";
import { z } from "zod";
import { recordId, validationFailure } from "../lib/form-validation";

const receiptSchema = z.object({
  orderId: recordId,
  reference: z
    .string()
    .trim()
    .min(3, "Enter at least 3 characters")
    .max(120, "Use at most 120 characters"),
  method: z
    .enum([
      CodSettlementMethods.Cash,
      CodSettlementMethods.BankTransfer,
      CodSettlementMethods.MobileFinancialService,
      CodSettlementMethods.Other,
    ])
    .default(CodSettlementMethods.Other),
});

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../lib/session";
import { remitCodCollection } from "../lib/order-reconciliation";

export type ReconciliationState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

function refreshOrder(number: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/account/orders");
  revalidatePath(`/admin/orders/${number}`);
  revalidatePath(`/account/orders/${number}`);
  revalidatePath(`/order/${number}/result`);
  revalidatePath(`/rider/orders/${number}`);
  revalidatePath("/rider");
  revalidatePath("/rider/history");
}

export async function remitCodAction(
  _previous: ReconciliationState,
  data: FormData,
): Promise<ReconciliationState> {
  const admin = await requireAdmin();
  const parsed = receiptSchema.safeParse(Object.fromEntries(data.entries()));
  if (!parsed.success) return validationFailure(parsed.error);
  const result = await remitCodCollection(
    parsed.data.orderId,
    parsed.data.reference,
    { id: admin.id, name: admin.name ?? "Admin", role: Roles.Admin },
    parsed.data.method,
  );
  if (!result.ok) return result;
  refreshOrder(result.number);
  return { ok: true };
}
