"use server";

import { InboxCategories } from "@backend/lib/enums.mjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../lib/session";
import { recordId } from "../lib/form-validation";
import { markInboxCategoryRead, setInboxRead } from "../lib/inbox";

export type InboxActionResult = { ok: boolean; error?: string } | null;
const schema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("single"), id: recordId, read: z.enum(["true", "false"]) }),
  z.object({
    operation: z.literal("all"),
    category: z.enum([InboxCategories.PROMOTION, InboxCategories.NOTIFICATION]),
  }),
]);

export async function updateInbox(
  _previous: InboxActionResult,
  data: FormData,
): Promise<InboxActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to manage your inbox" };
  const parsed = schema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { ok: false, error: "Invalid inbox action. Refresh and try again" };
  const input = parsed.data;
  if (input.operation === "single") {
    const changed = await setInboxRead(user.id, input.id, input.read === "true");
    if (!changed.count) return { ok: false, error: "Message not found" };
  } else await markInboxCategoryRead(user.id, input.category);
  revalidatePath("/", "layout");
  return { ok: true };
}
