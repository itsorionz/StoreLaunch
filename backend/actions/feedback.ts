"use server";

import { validationFailure } from "../lib/form-validation";

import { z } from "zod";
import { db } from "../lib/db";
import { getCurrentUser } from "../lib/session";
import { revalidatePath } from "next/cache";

export type FeedbackState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

const suggestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(3, "Enter at least 3 characters")
    .max(2000, "Use at most 2000 characters"),
});
const riderSchema = z.object({
  message: z
    .string()
    .trim()
    .min(3, "Enter at least 3 characters")
    .max(2000, "Use at most 2000 characters"),
  rating: z.coerce
    .number()
    .int("Choose a whole star rating")
    .min(1, "Choose 1 to 5 stars")
    .max(5, "Choose 1 to 5 stars"),
});

export async function sendFeedback(
  prev: FeedbackState | null,
  formData: FormData,
): Promise<FeedbackState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first" };

  const kind = formData.get("kind");
  if (kind !== "rider" && kind !== "suggest") return { error: "Choose a valid feedback type" };

  let feedback: { message: string; rating?: number };
  if (kind === "rider") {
    const p = riderSchema.safeParse({
      message: formData.get("message"),
      rating: formData.get("rating"),
    });
    if (!p.success) return validationFailure(p.error);
    feedback = p.data;
  } else {
    const p = suggestSchema.safeParse({ message: formData.get("message") });
    if (!p.success) return validationFailure(p.error);
    feedback = p.data;
  }

  await db.feedback.create({ data: { userId: user.id, kind, ...feedback } });
  revalidatePath("/account/suggest");
  revalidatePath("/admin/feedback");

  return { ok: true };
}
