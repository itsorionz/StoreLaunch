import Link from "next/link";
import { requireServicePage } from "@backend/lib/session";
import { listOpenConversations } from "@backend/lib/chat";
import { getSupportDashboard } from "@backend/lib/support-dashboard";
import { getDict } from "@frontend/i18n/dict";
import { ChatRefresh } from "@frontend/components/chat/chat-refresh";
import { QueueRow } from "@frontend/components/service/queue-row";
import { SupportAttention, SupportMetric } from "@frontend/components/service/service-ui";
import { SupportTrend } from "@frontend/components/service/support-trend";

export const metadata = { title: "Dashboard — Support" };

function minutes(value: number | null): string {
  return value === null ? "—" : `${value} min`;
}

export default async function SupportDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const agent = await requireServicePage();
  const dict = await getDict();
  const params = await searchParams;
  const [data, queue] = await Promise.all([
    getSupportDashboard(agent.id, params.range),
    listOpenConversations({ id: agent.id, role: agent.role }),
  ]);

  const date = (value: Date) =>
    value.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short" });

  return (
    <div className="animate-fade-up space-y-6" data-support-dashboard>
      <ChatRefresh />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Customer Service
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{dict.service.overview}</h1>
          <p className="mt-2 text-sm text-muted">{dict.service.overviewHint}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/support/tickets/new" className="btn-primary">
            + {dict.service.newTicket}
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
        <nav aria-label="Dashboard period" className="flex gap-1 rounded-lg bg-surface-2 p-1">
          {[7, 30, 90].map((days) => (
            <Link
              key={days}
              href={`/support?range=${days}`}
              aria-current={data.period.days === days ? "page" : undefined}
              className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                data.period.days === days
                  ? "bg-surface text-primary shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Last {days} days
            </Link>
          ))}
        </nav>
        <p className="text-xs text-muted">
          {date(data.period.start)} – {date(data.period.end)} · Bangladesh time
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Live chat metrics">
        <SupportMetric
          label="Open chats"
          value={String(data.chat.open)}
          detail={`${data.chat.mine} yours · ${data.chat.unread} unread · ${data.chat.resolvedToday} resolved today`}
        />
        <SupportMetric
          label="Unassigned chats"
          value={String(data.chat.unassigned)}
          hint={data.chat.unassigned > 0 ? "Waiting for an agent" : "All claimed"}
          detail="Open conversations nobody has taken yet"
          accent={data.chat.unassigned > 0}
        />
        <SupportMetric
          label="Awaiting our reply"
          value={String(data.chat.awaitingReply)}
          hint={data.chat.stale > 0 ? `${data.chat.stale} waiting over 15 min` : null}
          detail="Customer sent the newest message"
        />
        <SupportMetric
          label="First reply (avg)"
          value={minutes(data.chat.avgFirstResponseMin)}
          detail="Across conversations started today"
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Ticket metrics">
        <SupportMetric
          label="Open tickets"
          value={String(data.tickets.open)}
          detail={`${data.tickets.mine} yours · ${data.tickets.waiting} waiting · ${data.tickets.urgent} urgent`}
        />
        <SupportMetric
          label="Unassigned tickets"
          value={String(data.tickets.unassigned)}
          hint={data.tickets.unassigned > 0 ? "Pick these up" : "All have an owner"}
          detail="Open cases without an assignee"
          accent={data.tickets.unassigned > 0}
        />
        <SupportMetric
          label="Escalated"
          value={String(data.tickets.escalated)}
          hint={data.tickets.escalated > 0 ? "Needs ops attention" : "None open"}
          detail="Open cases flagged for escalation"
          accent={data.tickets.escalated > 0}
        />
        <SupportMetric
          label="First note (avg)"
          value={minutes(data.tickets.avgFirstResponseMin)}
          detail={`${data.tickets.resolvedToday} resolved today`}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-primary/20 bg-primary/5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/15 px-5 py-4">
          <div>
            <h2 className="font-bold">{dict.service.needsAttention}</h2>
            <p className="mt-1 text-xs text-muted">{dict.service.attentionHint}</p>
          </div>
          <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-primary">
            {data.chat.unassigned +
              data.chat.stale +
              data.tickets.unassigned +
              data.tickets.escalated ===
            0
              ? "All clear"
              : `${data.chat.unassigned + data.chat.stale + data.tickets.unassigned + data.tickets.escalated} flags`}
          </span>
        </div>
        <div className="grid gap-px bg-border/50 sm:grid-cols-2 xl:grid-cols-4">
          <SupportAttention
            href="/support#queue"
            label="Claim unassigned chats"
            count={data.chat.unassigned}
            detail="New customer messages with no agent"
          />
          <SupportAttention
            href="/support#queue"
            label="Stale conversations"
            count={data.chat.stale}
            detail="No reply for over 15 minutes"
            urgent={data.chat.stale > 0}
          />
          <SupportAttention
            href="/support/tickets?view=unassigned"
            label="Pick up unassigned tickets"
            count={data.tickets.unassigned}
            detail="Open cases without an assignee"
          />
          <SupportAttention
            href="/support/tickets?view=escalated"
            label="Review escalated tickets"
            count={data.tickets.escalated}
            detail="Flagged for operations follow-up"
            urgent={data.tickets.escalated > 0}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <SupportTrend days={data.trend} />
        </div>
        <section className="card p-5">
          <h2 className="font-bold">{dict.service.operations}</h2>
          <p className="mt-1 text-xs text-muted">{dict.service.operationsHint}</p>
          <ul className="mt-4 space-y-2">
            <li>
              <Link
                href="/support/orders?queue=returns"
                className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 transition-colors hover:border-primary/40"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{dict.service.returnsAwaiting}</p>
                  <p className="text-[11px] text-muted">Return / cancellation requests to review</p>
                </div>
                <span className="badge badge-primary">{data.ops.returnsRequested}</span>
              </Link>
            </li>
            <li>
              <Link
                href="/support/orders?queue=payment-review"
                className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 transition-colors hover:border-primary/40"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{dict.service.paymentsReview}</p>
                  <p className="text-[11px] text-muted">Gateway payments held for manual checks</p>
                </div>
                <span className="badge badge-primary">{data.ops.paymentReview}</span>
              </Link>
            </li>
          </ul>
        </section>
      </div>

      <section id="queue" className="scroll-mt-24">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{dict.service.queue}</h2>
            <p className="mt-0.5 text-sm text-muted">{dict.service.queueHint}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge badge-muted">
              {queue.length} {dict.service.total}
            </span>
            <Link href="/support/closed" className="btn-ghost">
              {dict.service.closed}
            </Link>
          </div>
        </div>
        {queue.length === 0 ? (
          <div className="card p-10 text-center text-sm text-muted">{dict.service.queueEmpty}</div>
        ) : (
          <ul className="space-y-3">
            {queue.map((item) => (
              <QueueRow key={item.id} item={item} dict={dict} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
