"use server";

import { updateTag, revalidatePath } from "next/cache";
import { requireAdmin } from "../lib/session";
import { saveStoreConfiguration } from "../lib/store-configuration";

export type SettingsState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: boolean;
} | null;

export async function updateSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireAdmin();
  const result = await saveStoreConfiguration(admin.id, Object.fromEntries(formData.entries()));
  if (!result.ok) return { error: result.error, fieldErrors: result.fieldErrors };
  updateTag("settings");
  revalidatePath("/admin/settings");
  revalidatePath("/");
  return { success: true };
}
