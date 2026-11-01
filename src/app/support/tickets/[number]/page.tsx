import Link from "next/link";
import { notFound } from "next/navigation";
import { requireServicePage } from "@backend/lib/session";
import { allowedStatuses, getTicket, listTicketAgents } from "@backend/lib/support-tickets";
import { getDict } from "@frontend/i18n/dict";
import { TicketControls } from "@frontend/components/service/ticket-controls";
import { TicketNoteForm } from "@frontend/components/service/ticket-note-form";
import {
  TicketPriorityBadge,
  TicketStatusBadge,
  formatDate,
  formatDateTime,
} from "@frontend/components/service/service-ui";

export const metadata = { title: "Ticket — Support" };

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  const agent = await requireServicePage();
  const dict = await getDict();
  const ticket = await getTicket({ id: agent.id, role: agent.role }, number);
  if (!ticket) notFound();
  const agents = await listTicketAgents();

  return (
    <div className="animate-fade-up space-y-5">
      <div>
        <Link
          href="/support/tickets"
          className="text-sm font-semibold text-primary transition-colors hover:underline"
        >
          ← {dict.service.backToTickets}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="badge badge-muted">{ticket.number}</span>
          <TicketStatusBadge status={ticket.status} />
          <TicketPriorityBadge priority={ticket.priority} />
          <span className="badge badge-muted">{ticket.category}</span>
          <span className="badge badge-muted">{ticket.source}</span>
          {ticket.escalated && <span className="badge-accent">{dict.service.escalated}</span>}
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{ticket.subject}</h1>
      </div>

      {ticket.escalated && (
        <section className="rounded-2xl border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm font-bold text-accent">
            {dict.service.escalatedOn} {formatDateTime(ticket.escalatedAt!)}
          </p>
          {ticket.escalationNote && (
            <p className="mt-1 text-sm text-muted">{ticket.escalationNote}</p>
          )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <TicketControls
            ticketId={ticket.id}
            status={ticket.status}
            priority={ticket.priority}
            assignedToId={ticket.assignedTo?.id ?? null}
            escalated={ticket.escalated}
            allowedStatuses={allowedStatuses(ticket.status)}
            agents={agents}
            viewerId={agent.id}
          />

          <section className="card p-5">
            <h2 className="font-bold">{dict.service.noteThread}</h2>
            <p className="mt-1 text-xs text-muted">{dict.service.noteThreadHint}</p>
            {ticket.notes.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">
                {dict.service.notesEmpty}
              </p>
            ) : (
              <ol className="mt-4 space-y-3">
                {ticket.notes.map((note) => (
                  <li key={note.id} className="rounded-xl border border-border bg-surface-2 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {note.authorName ?? dict.service.supportTeam}
                        <span className="ml-2 text-[11px] font-medium text-muted">
                          {note.authorRole === "Support"
                            ? dict.service.supportTeam
                            : note.authorRole}
                        </span>
                      </p>
                      <time dateTime={note.createdAt.toISOString()} className="text-xs text-muted">
                        {formatDateTime(note.createdAt)}
                      </time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm">{note.body}</p>
                  </li>
                ))}
              </ol>
            )}
            <TicketNoteForm ticketId={ticket.id} closed={ticket.status === "Closed"} />
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {dict.service.customer}
            </p>
            <p className="mt-1.5 font-semibold">{ticket.customer.name}</p>
            <p className="break-words text-xs text-muted">{ticket.customer.email}</p>
            {ticket.customer.phone && <p className="text-xs text-muted">{ticket.customer.phone}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/support/customers/${ticket.customer.id}`}
                className="btn-outline btn-sm"
              >
                {dict.service.openCustomer}
              </Link>
              <Link href="/support/tickets/new" className="btn-ghost btn-sm">
                + {dict.service.newTicket}
              </Link>
            </div>
          </section>

          <section className="card space-y-2 p-4 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {dict.service.relatedRecords}
            </p>
            {ticket.orderNumber ? (
              <Link
                href={`/support/orders/${ticket.orderNumber}`}
                className="block font-medium text-primary transition-colors hover:underline"
              >
                {dict.service.order} #{ticket.orderNumber}
              </Link>
            ) : (
              <p className="text-xs text-muted">{dict.service.noLinkedOrder}</p>
            )}
            {ticket.conversationId ? (
              <Link
                href={`/support/conversation/${ticket.conversationId}`}
                className="block font-medium text-primary transition-colors hover:underline"
              >
                {dict.service.relatedConversation}
              </Link>
            ) : (
              <p className="text-xs text-muted">{dict.service.noLinkedConversation}</p>
            )}
          </section>

          <section className="card space-y-2 p-4 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {dict.service.timelineLabel}
            </p>
            <MetaRow label={dict.service.openedAt} value={formatDateTime(ticket.createdAt)} />
            <MetaRow
              label={dict.service.firstResponse}
              value={ticket.firstResponseAt ? formatDateTime(ticket.firstResponseAt) : "—"}
            />
            <MetaRow
              label={dict.service.resolvedLabel}
              value={ticket.resolvedAt ? formatDateTime(ticket.resolvedAt) : "—"}
            />
            <MetaRow
              label={dict.service.closedAt}
              value={ticket.closedAt ? formatDateTime(ticket.closedAt) : "—"}
            />
            <MetaRow
              label={dict.service.ownerLabel}
              value={ticket.assignedTo?.name ?? dict.service.unassigned}
            />
            <MetaRow label={dict.service.lastActivity} value={formatDate(ticket.lastActivityAt)} />
          </section>
        </aside>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
