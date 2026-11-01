import Link from "next/link";
import { notFound } from "next/navigation";
import { requireServicePage } from "@backend/lib/session";
import { db } from "@backend/lib/db";
import { Roles, SupportTicketStatuses } from "@backend/lib/enums.mjs";
import { formatPrice } from "@backend/lib/money";
import { getDict } from "@frontend/i18n/dict";
import { StatusBadge } from "@frontend/components/admin/admin-ui";
import {
  TicketPriorityBadge,
  TicketStatusBadge,
  formatDate,
} from "@frontend/components/service/service-ui";

export const metadata = { title: "Customer — Support" };

// Customer 360: everything the agent needs to recognize a repeat complainant
// and answer with history — profile, wallet, recent orders, chats, tickets,
// feedback and reviews. Read-only (plan decision D6).
export default async function SupportCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireServicePage();
  const dict = await getDict();
  const customer = await db.user.findFirst({
    where: { id, roles: { has: Roles.Customer } },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      active: true,
      createdAt: true,
      gender: true,
      wallet: { select: { balanceCents: true } },
      _count: { select: { orders: true, chatConversations: true, supportTickets: true } },
    },
  });
  if (!customer) notFound();

  const [orders, conversations, tickets, feedback, reviews, spend] = await Promise.all([
    db.order.findMany({
      where: { userId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        number: true,
        status: true,
        totalCents: true,
        currencySymbol: true,
        currencyCode: true,
        paymentMethod: true,
        createdAt: true,
        items: { select: { quantity: true } },
      },
    }),
    db.chatConversation.findMany({
      where: { customerId: customer.id },
      orderBy: { lastMessageAt: "desc" },
      take: 6,
      select: {
        id: true,
        subject: true,
        status: true,
        createdAt: true,
        lastMessageAt: true,
        agent: { select: { name: true } },
      },
    }),
    db.supportTicket.findMany({
      where: { customerId: customer.id },
      orderBy: { lastActivityAt: "desc" },
      take: 6,
      select: {
        id: true,
        number: true,
        subject: true,
        status: true,
        priority: true,
        escalatedAt: true,
        createdAt: true,
        assignedTo: { select: { name: true } },
      },
    }),
    db.feedback.findMany({
      where: { userId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, kind: true, message: true, rating: true, createdAt: true },
    }),
    db.review.findMany({
      where: { userId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        rating: true,
        body: true,
        status: true,
        createdAt: true,
        product: { select: { name: true } },
      },
    }),
    db.order.aggregate({
      where: { userId: customer.id, paidAt: { not: null } },
      _sum: { totalCents: true },
      _count: true,
    }),
  ]);

  const openTickets = tickets.filter(
    (ticket) => ticket.status !== SupportTicketStatuses.Closed,
  ).length;

  return (
    <div className="animate-fade-up space-y-5">
      <div>
        <Link
          href="/support/customers"
          className="text-sm font-semibold text-primary transition-colors hover:underline"
        >
          ← Back to customers
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{customer.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {customer.email}
              {customer.phone ? ` · ${customer.phone}` : ""}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Joined {formatDate(customer.createdAt)}
              {!customer.active && " · account inactive"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/support/tickets/new?customerId=${customer.id}`} className="btn-primary">
              + {dict.service.newTicket}
            </Link>
          </div>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Customer metrics">
        <Metric
          label="Orders"
          value={String(customer._count.orders)}
          detail={`${spend._count} paid · ${spend._sum.totalCents ? formatPrice(spend._sum.totalCents) : "৳0"} lifetime`}
        />
        <Metric
          label="Wallet balance"
          value={
            customer.wallet && customer.wallet.balanceCents > 0
              ? formatPrice(customer.wallet.balanceCents)
              : "৳0"
          }
          detail="Available store credit"
        />
        <Metric
          label="Conversations"
          value={String(customer._count.chatConversations)}
          detail="Live chat history"
        />
        <Metric
          label="Open tickets"
          value={String(openTickets)}
          detail={`${customer._count.supportTickets} total · ${tickets.filter((t) => t.escalatedAt).length} escalated`}
          accent={openTickets > 0}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <section className="card overflow-x-auto">
            <div className="flex items-center justify-between gap-2 px-5 pt-5">
              <h2 className="font-bold">Recent orders</h2>
              <Link
                href="/support/orders"
                className="text-xs font-semibold text-primary hover:underline"
              >
                Order lookup
              </Link>
            </div>
            {orders.length === 0 ? (
              <p className="p-5 text-sm text-muted">No orders yet.</p>
            ) : (
              <table className="mt-3 w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-semibold uppercase tracking-wider text-muted">
                    <th className="px-5 py-3">Order</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Total</th>
                    <th className="px-5 py-3 text-right">Placed</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b border-border/60 last:border-0">
                      <td className="px-5 py-3">
                        <Link
                          href={`/support/orders/${order.number}`}
                          className="font-medium transition-colors hover:text-primary"
                        >
                          #{order.number}
                        </Link>
                        <span className="block text-xs text-muted">
                          {order.items.reduce((sum, item) => sum + item.quantity, 0)} items
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-5 py-3 text-right font-medium">
                        {formatPrice(
                          order.totalCents,
                          order.currencySymbol ||
                            (order.currencyCode ? `${order.currencyCode} ` : undefined),
                        )}
                      </td>
                      <td className="px-5 py-3 text-right text-xs text-muted">
                        {formatDate(order.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold">{dict.service.tickets}</h2>
              <span className="badge badge-muted">
                {customer._count.supportTickets} {dict.service.cases}
              </span>
            </div>
            {tickets.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No tickets for this customer.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {tickets.map((ticket) => (
                  <li
                    key={ticket.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/support/tickets/${ticket.number}`}
                        className="block truncate font-semibold transition-colors hover:text-primary"
                      >
                        <span className="text-xs text-muted">{ticket.number}</span> {ticket.subject}
                      </Link>
                      <p className="text-xs text-muted">
                        {ticket.assignedTo?.name ?? dict.service.unassigned} ·{" "}
                        {formatDate(ticket.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <TicketPriorityBadge priority={ticket.priority} />
                      <TicketStatusBadge status={ticket.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={`/support/tickets?view=all&q=${encodeURIComponent(customer.email)}`}
              className="mt-3 inline-block text-xs font-semibold text-primary hover:underline"
            >
              View all tickets
            </Link>
          </section>

          <section className="card p-5">
            <h2 className="font-bold">Feedback & reviews</h2>
            {feedback.length === 0 && reviews.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No feedback submitted yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {feedback.map((entry) => (
                  <li key={entry.id} className="rounded-xl border border-border p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                      {entry.kind}
                      {entry.rating ? ` · ${entry.rating}/5` : ""} · {formatDate(entry.createdAt)}
                    </p>
                    <p className="mt-1">{entry.message}</p>
                  </li>
                ))}
                {reviews.map((review) => (
                  <li key={review.id} className="rounded-xl border border-border p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Review · {review.rating}/5 · {review.status} · {formatDate(review.createdAt)}
                    </p>
                    <p className="mt-1 font-medium">{review.product.name}</p>
                    {review.body && <p className="mt-0.5 text-muted">{review.body}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card p-5 text-sm">
            <h2 className="mb-2 font-bold">Profile</h2>
            <dl className="space-y-1.5">
              <Row label="Name" value={customer.name} />
              <Row label="Email" value={customer.email} />
              <Row label="Phone" value={customer.phone ?? "—"} />
              <Row label="Gender" value={customer.gender ?? "—"} />
              <Row label="Status" value={customer.active ? "Active" : "Inactive"} />
              <Row label="Joined" value={formatDate(customer.createdAt)} />
            </dl>
          </section>

          <section className="card p-5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold">Conversations</h2>
              <span className="badge badge-muted">{customer._count.chatConversations}</span>
            </div>
            {conversations.length === 0 ? (
              <p className="mt-3 text-xs text-muted">No chat history.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <Link
                      href={`/support/conversation/${conversation.id}`}
                      className="block truncate transition-colors hover:text-primary"
                    >
                      {conversation.subject || "Conversation"}
                    </Link>
                    <span className="text-[11px] text-muted">
                      {conversation.status} · {formatDate(conversation.lastMessageAt)}
                      {conversation.agent ? ` · ${conversation.agent.name}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <Link href="/support/tickets/new" className="btn-outline w-full">
              + {dict.service.newTicket}
            </Link>
            <Link href="/support/orders" className="btn-ghost mt-2 w-full">
              Order lookup
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div className="card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p
        className={`mt-1.5 text-2xl font-bold tracking-tight ${accent ? "text-accent" : "text-foreground"}`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{detail}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate text-right font-medium">{value}</dd>
    </div>
  );
}
