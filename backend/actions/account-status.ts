"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../lib/session";
import { accountStatusSchema, setAccountStatus } from "../lib/account-status";
import { validationFailure } from "../lib/form-validation";

export type AccountStatusState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

export async function updateAccountStatus(
  _previous: AccountStatusState,
  data: FormData,
): Promise<AccountStatusState> {
  const admin = await requireAdmin();
  const parsed = accountStatusSchema.safeParse(Object.fromEntries(data.entries()));
  if (!parsed.success) return validationFailure(parsed.error);
  const result = await setAccountStatus(admin.id, parsed.data);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
