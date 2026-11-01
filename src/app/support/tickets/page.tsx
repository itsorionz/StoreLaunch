import Link from "next/link";
import { requireServicePage } from "@backend/lib/session";
import { listTickets } from "@backend/lib/support-tickets";
import { getDict } from "@frontend/i18n/dict";
import {
  FilterPills,
  Pagination,
  TicketPriorityBadge,
  TicketStatusBadge,
  relativeTime,
} from "@frontend/components/service/service-ui";

export const metadata = { title: "Tickets — Support" };

const viewLabels: Record<string, string> = {
  open: "Open",
  mine: "Mine",
  unassigned: "Unassigned",
  escalated: "Escalated",
  closed: "Closed",
  all: "All",
};

const priorityLabels = ["Urgent", "High", "Normal", "Low"];

export default async function SupportTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; priority?: string; q?: string; page?: string }>;
}) {
  const agent = await requireServicePage();
  const dict = await getDict();
  const params = await searchParams;
  const list = await listTickets({ id: agent.id, role: agent.role }, params);

  const linkWith = (patch: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = {
      view: list.filters.view !== "open" ? list.filters.view : undefined,
      priority: list.filters.priority ?? undefined,
      q: list.filters.q || undefined,
      ...patch,
    };
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) if (value) search.set(key, value);
    const query = search.toString();
    return `/support/tickets${query ? `?${query}` : ""}`;
  };

  return (
    <div className="animate-fade-up space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{dict.service.tickets}</h1>
          <p className="mt-1 text-sm text-muted">{dict.service.ticketsHint}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge badge-muted">
            {list.total} {dict.service.cases}
          </span>
          <Link href="/support/tickets/new" className="btn-primary">
            + {dict.service.newTicket}
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterPills
          items={(["open", "mine", "unassigned", "escalated", "closed", "all"] as const).map(
            (view) => ({
              href: linkWith({ view: view === "open" ? undefined : view, page: undefined }),
              label: viewLabels[view],
              active: list.filters.view === view,
              count: list.counts[view],
            }),
          )}
        />
        <form method="get" action="/support/tickets" className="flex gap-2">
          {list.filters.view !== "open" && (
            <input type="hidden" name="view" value={list.filters.view} />
          )}
          {list.filters.priority && (
            <input type="hidden" name="priority" value={list.filters.priority} />
          )}
          <input
            type="search"
            name="q"
            defaultValue={list.filters.q}
            maxLength={120}
            placeholder={dict.service.searchTickets}
            className="input w-56"
          />
          <button type="submit" className="btn-outline shrink-0">
            {dict.common.search}
          </button>
        </form>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Link
          href={linkWith({ priority: undefined, page: undefined })}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            !list.filters.priority
              ? "bg-surface-2 text-foreground"
              : "border border-border bg-surface text-muted hover:border-primary hover:text-primary"
          }`}
        >
          All priorities
        </Link>
        {priorityLabels.map((priority) => (
          <Link
            key={priority}
            href={linkWith({ priority, page: undefined })}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              list.filters.priority === priority
                ? "bg-surface-2 text-foreground"
                : "border border-border bg-surface text-muted hover:border-primary hover:text-primary"
            }`}
          >
            {priority}
          </Link>
        ))}
      </div>

      {list.items.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">{dict.service.ticketsEmpty}</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-semibold uppercase tracking-wider text-muted">
                <th className="px-5 py-3.5">Ticket</th>
                <th className="px-5 py-3.5">Customer</th>
                <th className="px-5 py-3.5">Order</th>
                <th className="px-5 py-3.5">Priority</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Owner</th>
                <th className="px-5 py-3.5 text-right">Activity</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((ticket) => (
                <tr
                  key={ticket.id}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-2"
                >
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/support/tickets/${ticket.number}`}
                      className="block font-semibold transition-colors hover:text-primary"
                    >
                      <span className="text-xs text-muted">{ticket.number}</span>
                      <span className="block max-w-64 truncate">{ticket.subject}</span>
                    </Link>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {ticket.escalated && <span className="badge-accent">Escalated</span>}
                      <span className="badge badge-muted">{ticket.category}</span>
                      <span className="badge badge-muted">{ticket.noteCount} notes</span>
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/support/customers/${ticket.customer.id}`}
                      className="transition-colors hover:text-primary"
                    >
                      <span className="block font-medium">{ticket.customer.name}</span>
                      <span className="block max-w-44 truncate text-xs text-muted">
                        {ticket.customer.email}
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    {ticket.orderNumber ? (
                      <Link
                        href={`/support/orders/${ticket.orderNumber}`}
                        className="font-medium transition-colors hover:text-primary"
                      >
                        #{ticket.orderNumber}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <TicketPriorityBadge priority={ticket.priority} />
                  </td>
                  <td className="px-5 py-3.5">
                    <TicketStatusBadge status={ticket.status} />
                  </td>
                  <td className="px-5 py-3.5 text-sm">
                    {ticket.assignedTo ? (
                      ticket.assignedTo.name
                    ) : (
                      <span className="text-xs text-muted">{dict.service.unassigned}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right text-xs text-muted">
                    {relativeTime(ticket.lastActivityAt)} {dict.service.ago}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={list.page}
        pages={list.pages}
        hrefFor={(page) => linkWith({ page: String(page) })}
      />
    </div>
  );
}
