"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CodSettlementMethods, Roles } from "@backend/lib/enums.mjs";
import { recordId, validationFailure } from "@backend/lib/form-validation";
import { requireAdmin } from "@backend/lib/session";
import { createCodSettlement, type CodSettlementLineInput } from "@backend/lib/cod-settlement";

export type CodSettlementActionState = {
  ok?: boolean;
  error?: string;
  settlementId?: string;
  fieldErrors?: Record<string, string[]>;
} | null;
const headerSchema = z.object({
  method: z.enum([
    CodSettlementMethods.Cash,
    CodSettlementMethods.BankTransfer,
    CodSettlementMethods.MobileFinancialService,
    CodSettlementMethods.Other,
  ]),
  reference: z.string().trim().min(3, "Enter at least 3 characters").max(120),
  note: z.string().trim().max(500).optional().default(""),
  courier: z.string().trim().max(120).optional().default(""),
});
function takaToCents(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^\d{1,9}(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export async function recordCodSettlementAction(
  _previous: CodSettlementActionState,
  form: FormData,
): Promise<CodSettlementActionState> {
  const admin = await requireAdmin();
  const header = headerSchema.safeParse(Object.fromEntries(form.entries()));
  if (!header.success) return validationFailure(header.error);
  const collectionIds = form.getAll("collectionId");
  if (
    !collectionIds.length ||
    collectionIds.length > 100 ||
    collectionIds.some((value) => typeof value !== "string" || !recordId.safeParse(value).success)
  )
    return { error: "Select between one and 100 valid collections" };
  const lines: CodSettlementLineInput[] = [];
  for (const value of collectionIds as string[]) {
    const expectedCents = takaToCents(form.get(`expected:${value}`));
    const receivedCents = takaToCents(form.get(`received:${value}`));
    const varianceReason = String(form.get(`varianceReason:${value}`) ?? "").trim();
    if (expectedCents === null || expectedCents < 1)
      return { fieldErrors: { [`expected:${value}`]: ["Enter a positive expected amount"] } };
    if (receivedCents === null)
      return { fieldErrors: { [`received:${value}`]: ["Enter a non-negative received amount"] } };
    if (receivedCents !== expectedCents && varianceReason.length < 5)
      return {
        fieldErrors: {
          [`varianceReason:${value}`]: [
            "Explain the short or over amount in at least 5 characters",
          ],
        },
      };
    lines.push({ collectionId: value, expectedCents, receivedCents, varianceReason });
  }
  const { courier, ...headerFields } = header.data;
  const result = await createCodSettlement(
    {
      ...headerFields,
      courierName: courier || undefined,
      lines,
    },
    { id: admin.id, name: admin.name ?? "Admin", role: Roles.Admin },
  );
  if (!result.ok) return { error: result.error };
  for (const path of ["/admin", "/admin/orders", "/admin/reconciliation", "/rider", "/rider/cash"])
    revalidatePath(path);
  return { ok: true, settlementId: result.settlementId };
}
