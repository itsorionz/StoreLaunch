import Link from "next/link";
import { redirect } from "next/navigation";
import { getService } from "@backend/lib/session";
import { getConversation } from "@backend/lib/chat";
import { db } from "@backend/lib/db";
import { ChatConversationStatuses, SupportTicketStatuses } from "@backend/lib/enums.mjs";
import { getDict } from "@frontend/i18n/dict";
import { formatPrice } from "@backend/lib/money";
import { StatusBadge } from "@frontend/components/admin/admin-ui";
import { TicketStatusBadge } from "@frontend/components/service/service-ui";
import {
  closeServiceConversation,
  sendServiceMessage,
  takeConversation,
} from "@backend/actions/chat";
import { ChatThread } from "@frontend/components/chat/chat-thread";
import { ChatComposer } from "@frontend/components/chat/chat-composer";
import { ChatRefresh } from "@frontend/components/chat/chat-refresh";
import { ServiceFormButton } from "@frontend/components/service/service-form-button";

export const metadata = { title: "Conversation - Support" };

function formatDate(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await getService();
  if (!agent) redirect("/login?callbackUrl=/support");
  const dict = await getDict();
  const thread = await getConversation({ id: agent.id, role: agent.role }, id);
  if (!thread) redirect("/support");

  const isOpen = thread.status === ChatConversationStatuses.Open;
  const claimedByMe = thread.agent?.id === agent.id;
  const taken = Boolean(thread.agent);
  const canReply = isOpen && (!taken || claimedByMe);

  // Context rail: the customer's recent orders and open cases so the agent
  // never leaves the thread to answer "where is my order?".
  const [recentOrders, openTickets] = await Promise.all([
    db.order.findMany({
      where: { userId: thread.customer.id },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        id: true,
        number: true,
        status: true,
        totalCents: true,
        currencySymbol: true,
        currencyCode: true,
        createdAt: true,
      },
    }),
    db.supportTicket.findMany({
      where: {
        customerId: thread.customer.id,
        status: { notIn: [SupportTicketStatuses.Closed] },
      },
      orderBy: { lastActivityAt: "desc" },
      take: 4,
      select: { id: true, number: true, subject: true, status: true, priority: true },
    }),
  ]);

  return (
    <div className="space-y-4">
      <ChatRefresh />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/support"
          className="text-sm font-semibold text-primary transition-colors hover:underline"
        >
          ← {dict.service.back}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {isOpen && !taken && (
            <ServiceFormButton
              action={takeConversation}
              fields={{ conversationId: thread.id }}
              label={dict.service.take}
              pendingLabel={dict.service.taking}
              className="btn-primary"
            />
          )}
          {isOpen && (claimedByMe || !taken) && (
            <ServiceFormButton
              action={closeServiceConversation}
              fields={{ conversationId: thread.id }}
              label={dict.service.close}
              pendingLabel={dict.service.closing}
              className="btn-outline text-accent"
            />
          )}
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">{thread.customer.name}</p>
            <p className="truncate text-xs text-muted">
              {thread.customer.email}
              {thread.customer.phone ? ` · ${thread.customer.phone}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {thread.orderNumber && (
              <span className="badge badge-muted">
                {dict.service.order} #{thread.orderNumber}
              </span>
            )}
            {thread.subject && <span className="badge badge-primary">{thread.subject}</span>}
            {!isOpen && <span className="badge">{dict.service.closed}</span>}
            {isOpen && !taken && <span className="badge-accent">{dict.service.unassigned}</span>}
            {isOpen && claimedByMe && (
              <span className="badge badge-primary">{dict.service.mine}</span>
            )}
            {isOpen && taken && !claimedByMe && (
              <span className="badge">
                {dict.service.claimedBy} {thread.agent?.name}
              </span>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs text-muted">
          <span>
            {dict.service.openedAt}: {formatDate(thread.createdAt)}
          </span>
          {!isOpen && thread.closedAt && (
            <span>
              {dict.service.closedAt}: {formatDate(thread.closedAt)}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <div className="card p-6">
            <ChatThread
              messages={thread.messages}
              viewerId={agent.id}
              counterpartLabel={thread.customer.name}
              emptyLabel={dict.chat.empty}
            />
            <div className="mt-4">
              {isOpen && canReply ? (
                <ChatComposer
                  action={sendServiceMessage}
                  conversationId={thread.id}
                  placeholder={dict.chat.placeholder}
                  sendLabel={dict.chat.send}
                />
              ) : (
                <p className="rounded-xl border border-dashed border-border px-4 py-3 text-center text-sm text-muted">
                  {isOpen ? dict.service.takenByOther : dict.service.conversationClosed}
                </p>
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="card p-4 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {dict.service.customer}
            </p>
            <p className="mt-1.5 font-semibold">{thread.customer.name}</p>
            <p className="break-words text-xs text-muted">{thread.customer.email}</p>
            {thread.customer.phone && <p className="text-xs text-muted">{thread.customer.phone}</p>}
            <Link
              href={`/support/customers/${thread.customer.id}`}
              className="btn-outline btn-sm mt-3 inline-block"
            >
              {dict.service.openCustomer}
            </Link>
          </section>

          <section className="card p-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {dict.service.orders}
              </p>
              <Link
                href="/support/orders"
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                Lookup
              </Link>
            </div>
            {recentOrders.length === 0 ? (
              <p className="mt-2 text-xs text-muted">No orders yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {recentOrders.map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/support/orders/${order.number}`}
                      className="flex items-center justify-between gap-2 transition-colors hover:text-primary"
                    >
                      <span className="font-medium">#{order.number}</span>
                      <span className="text-xs font-medium">
                        {formatPrice(
                          order.totalCents,
                          order.currencySymbol ||
                            (order.currencyCode ? `${order.currencyCode} ` : undefined),
                        )}
                      </span>
                    </Link>
                    <span className="inline-block mt-0.5">
                      <StatusBadge status={order.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {dict.service.tickets}
              </p>
              <span className="badge badge-muted">{openTickets.length}</span>
            </div>
            {openTickets.length === 0 ? (
              <p className="mt-2 text-xs text-muted">{dict.service.ticketsEmpty}</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {openTickets.map((ticket) => (
                  <li key={ticket.id}>
                    <Link
                      href={`/support/tickets/${ticket.number}`}
                      className="block truncate transition-colors hover:text-primary"
                    >
                      <span className="text-xs text-muted">{ticket.number}</span> {ticket.subject}
                    </Link>
                    <span className="mt-0.5 inline-block">
                      <TicketStatusBadge status={ticket.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={`/support/tickets/new?conversationId=${thread.id}`}
              className="btn-primary btn-sm mt-3 inline-block w-full text-center"
            >
              + {dict.service.newTicket}
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
