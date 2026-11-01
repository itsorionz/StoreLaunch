"use server";

import { validationFailure } from "../lib/form-validation";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { signActivationToken } from "../lib/license";
import { performSetup, setupInputSchema } from "../lib/setup";

const ACTIVATION_COOKIE = "sl_act";
const ACTIVATION_DAYS = 365;

export type SetupState = { error?: string; fieldErrors?: Record<string, string[]> } | null;

export async function completeSetup(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const parsed = setupInputSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ...validationFailure(parsed.error) };
  }

  const result = await performSetup(parsed.data);
  if (!result.ok) return { error: result.error };

  const token = await signActivationToken(Date.now() + ACTIVATION_DAYS * 86400_000);
  updateTag("settings");
  const cookieStore = await cookies();
  cookieStore.set(ACTIVATION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACTIVATION_DAYS * 86400,
  });

  redirect("/admin");
}
