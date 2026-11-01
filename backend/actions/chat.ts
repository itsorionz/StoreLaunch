"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Roles } from "@backend/lib/enums.mjs";
import {
  claimConversation,
  closeConversation,
  postMessage,
  startConversation,
} from "@backend/lib/chat";
import { getCurrentUser, getService } from "@backend/lib/session";

export type ChatFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  conversationId?: string;
} | null;

export async function openChat(_prev: ChatFormState, form: FormData): Promise<ChatFormState> {
  const user = await getCurrentUser();
  if (!user || user.role !== Roles.Customer) return { error: "Sign in to chat with support" };
  const result = await startConversation(
    { id: user.id, role: user.role },
    {
      subject: form.get("subject") ?? undefined,
      body: form.get("body"),
      orderId: form.get("orderId") ?? undefined,
    },
  );
  if (!result.ok) return result;
  revalidatePath("/account/chat");
  revalidatePath("/support");
  return { ok: true, conversationId: result.conversationId };
}

export async function sendChatMessage(
  _prev: ChatFormState,
  form: FormData,
): Promise<ChatFormState> {
  const user = await getCurrentUser();
  if (!user || user.role !== Roles.Customer) return { error: "Sign in to chat with support" };
  const result = await postMessage(
    { id: user.id, role: user.role },
    form.get("conversationId"),
    form.get("body"),
  );
  if (!result.ok) return result;
  revalidatePath("/account/chat");
  revalidatePath("/support");
  return { ok: true, conversationId: result.conversationId };
}

export async function takeConversation(
  _prev: ChatFormState,
  form: FormData,
): Promise<ChatFormState> {
  const service = await getService();
  if (!service) return { error: "Sign in as a support agent" };
  const result = await claimConversation(
    { id: service.id, role: service.role },
    form.get("conversationId"),
  );
  if (!result.ok) return result;
  revalidatePath("/support");
  // Server-side redirect: a client push from the queue's Take button races the
  // revalidation that removes that very button.
  redirect(`/support/conversation/${result.conversationId}`);
}

export async function sendServiceMessage(
  _prev: ChatFormState,
  form: FormData,
): Promise<ChatFormState> {
  const service = await getService();
  if (!service) return { error: "Sign in as a support agent" };
  const result = await postMessage(
    { id: service.id, role: service.role },
    form.get("conversationId"),
    form.get("body"),
  );
  if (!result.ok) return result;
  revalidatePath("/support");
  if (result.conversationId) revalidatePath(`/support/conversation/${result.conversationId}`);
  revalidatePath("/support/closed");
  revalidatePath("/account/chat");
  return { ok: true, conversationId: result.conversationId };
}

export async function closeServiceConversation(
  _prev: ChatFormState,
  form: FormData,
): Promise<ChatFormState> {
  const service = await getService();
  if (!service) return { error: "Sign in as a support agent" };
  const result = await closeConversation(
    { id: service.id, role: service.role },
    form.get("conversationId"),
  );
  if (!result.ok) return result;
  revalidatePath("/support");
  if (result.conversationId) revalidatePath(`/support/conversation/${result.conversationId}`);
  revalidatePath("/support/closed");
  revalidatePath("/account/chat");
  return { ok: true, conversationId: result.conversationId };
}
