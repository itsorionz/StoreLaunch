"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getService } from "@backend/lib/session";
import { db } from "@backend/lib/db";
import { Roles } from "@backend/lib/enums.mjs";
import { userTextWhere } from "@backend/lib/search-filters";
import {
  addTicketNote,
  assignTicket,
  claimTicket,
  createTicket,
  escalateTicket,
  setTicketPriority,
  setTicketStatus,
} from "@backend/lib/support-tickets";

export type TicketFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  ticketId?: string;
  ticketNumber?: string;
} | null;

// Customer lookup behind the new-ticket form's picker (agent-only, capped).
export async function searchSupportCustomers(
  query: string,
): Promise<{ id: string; name: string; email: string; phone: string | null }[]> {
  const service = await getService();
  if (!service) return [];
  if (query.trim().length < 2) return [];
  const customers = await db.user.findMany({
    where: { roles: { has: Roles.Customer }, ...userTextWhere(query) },
    select: { id: true, name: true, email: true, phone: true },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  return customers;
}

function revalidateTickets(ticketId?: string) {
  revalidatePath("/support");
  revalidatePath("/support/tickets");
  if (ticketId) revalidatePath(`/support/tickets/${ticketId}`);
}

export async function createTicketAction(
  _prev: TicketFormState,
  form: FormData,
): Promise<TicketFormState> {
  const service = await getService();
  if (!service) return { error: "Sign in as a support agent" };
  const result = await createTicket(
    { id: service.id, role: service.role },
    {
      subject: form.get("subject"),
      body: form.get("body"),
      customerId: form.get("customerId"),
      orderId: form.get("orderId"),
      conversationId: form.get("conversationId"),
      category: form.get("category"),
      priority: form.get("priority"),
    },
  );
  if (!result.ok) return result;
  revalidateTickets(result.ticketId);
  // Server-side redirect so the form never races its own revalidation.
  redirect(`/support/tickets/${result.ticketNumber}`);
}

export async function addTicketNoteAction(
  _prev: TicketFormState,
  form: FormData,
): Promise<TicketFormState> {
  const service = await getService();
  if (!service) return { error: "Sign in as a support agent" };
  const result = await addTicketNote(
    { id: service.id, role: service.role },
    form.get("ticketId"),
    form.get("body"),
  );
  if (!result.ok) return result;
  revalidateTickets(result.ticketId);
  return { ok: true, ticketId: result.ticketId };
}

export async function setTicketStatusAction(
  _prev: TicketFormState,
  form: FormData,
): Promise<TicketFormState> {
  const service = await getService();
  if (!service) return { error: "Sign in as a support agent" };
  const result = await setTicketStatus(
    { id: service.id, role: service.role },
    form.get("ticketId"),
    form.get("status"),
  );
  if (!result.ok) return result;
  revalidateTickets(result.ticketId);
  return { ok: true, ticketId: result.ticketId };
}

export async function setTicketPriorityAction(
  _prev: TicketFormState,
  form: FormData,
): Promise<TicketFormState> {
  const service = await getService();
  if (!service) return { error: "Sign in as a support agent" };
  const result = await setTicketPriority(
    { id: service.id, role: service.role },
    form.get("ticketId"),
    form.get("priority"),
  );
  if (!result.ok) return result;
  revalidateTickets(result.ticketId);
  return { ok: true, ticketId: result.ticketId };
}

export async function claimTicketAction(
  _prev: TicketFormState,
  form: FormData,
): Promise<TicketFormState> {
  const service = await getService();
  if (!service) return { error: "Sign in as a support agent" };
  const result = await claimTicket({ id: service.id, role: service.role }, form.get("ticketId"));
  if (!result.ok) return result;
  revalidateTickets(result.ticketId);
  return { ok: true, ticketId: result.ticketId };
}

export async function assignTicketAction(
  _prev: TicketFormState,
  form: FormData,
): Promise<TicketFormState> {
  const service = await getService();
  if (!service) return { error: "Sign in as a support agent" };
  const result = await assignTicket(
    { id: service.id, role: service.role },
    form.get("ticketId"),
    form.get("assignee"),
  );
  if (!result.ok) return result;
  revalidateTickets(result.ticketId);
  return { ok: true, ticketId: result.ticketId };
}

export async function escalateTicketAction(
  _prev: TicketFormState,
  form: FormData,
): Promise<TicketFormState> {
  const service = await getService();
  if (!service) return { error: "Sign in as a support agent" };
  const result = await escalateTicket(
    { id: service.id, role: service.role },
    form.get("ticketId"),
    form.get("escalationNote"),
  );
  if (!result.ok) return result;
  revalidateTickets(result.ticketId);
  return { ok: true, ticketId: result.ticketId };
}
