import Link from "next/link";
import { notFound } from "next/navigation";
import { requireServicePage } from "@backend/lib/session";
import {
  getTicketPrefillConversation,
  getTicketPrefillCustomer,
  getTicketPrefillOrder,
} from "@backend/lib/support-queries";
import { getDict } from "@frontend/i18n/dict";
import { TicketNewForm, type TicketPrefill } from "@frontend/components/service/ticket-new-form";

export const metadata = { title: "New ticket — Support" };

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; orderId?: string; conversationId?: string }>;
}) {
  await requireServicePage();
  const dict = await getDict();
  const params = await searchParams;

  // Context can arrive from the customer 360, an order page or a conversation;
  // whichever resolves first wins and carries the customer along.
  let prefill: TicketPrefill = {};
  if (params.conversationId) {
    const conversation = await getTicketPrefillConversation(params.conversationId);
    if (!conversation) notFound();
    prefill = {
      customerId: conversation.customerId,
      customerName: conversation.customer.name,
      customerEmail: conversation.customer.email,
      conversationId: conversation.id,
      orderId: conversation.orderId ?? undefined,
      subject: conversation.subject ?? "",
    };
  } else if (params.orderId) {
    const order = await getTicketPrefillOrder(params.orderId);
    if (!order) notFound();
    prefill = {
      customerId: order.user.id,
      customerName: order.user.name,
      customerEmail: order.user.email,
      orderId: order.id,
      subject: `Order #${order.number}`,
    };
  } else if (params.customerId) {
    const customer = await getTicketPrefillCustomer(params.customerId);
    if (!customer) notFound();
    prefill = {
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
    };
  }

  return (
    <div className="animate-fade-up mx-auto max-w-2xl space-y-5">
      <div>
        <Link
          href="/support/tickets"
          className="text-sm font-semibold text-primary transition-colors hover:underline"
        >
          ← {dict.service.backToTickets}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{dict.service.newTicket}</h1>
        <p className="mt-1 text-sm text-muted">{dict.service.newTicketHint}</p>
      </div>
      <div className="card p-5">
        <TicketNewForm prefill={prefill} />
      </div>
    </div>
  );
}
