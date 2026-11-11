import Link from "next/link";
import { SupportTicketPriorities, SupportTicketStatuses } from "@backend/lib/enums.mjs";

// View-level types derived from the public enums, so UI code never touches the
// generated ORM client. The Prisma model types are the same string unions.
type SupportTicketStatus = (typeof SupportTicketStatuses)[keyof typeof SupportTicketStatuses];
type SupportTicketPriority = (typeof SupportTicketPriorities)[keyof typeof SupportTicketPriorities];

export function relativeTime(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "1m";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// KPI card — one number an agent can act on, with context underneath.
export function SupportMetric({
  label,
  value,
  hint,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string | null;
  detail?: string;
  accent?: boolean;
}) {
  return (
    <div className="card p-4" data-metric={label}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p
        className={`mt-1.5 text-2xl font-bold tracking-tight ${accent ? "text-accent" : "text-foreground"}`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs font-semibold text-primary">{hint}</p>}
      {detail && <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{detail}</p>}
    </div>
  );
}

// One "do this next" cell in the attention strip.
export function SupportAttention({
  href,
  label,
  count,
  detail,
  urgent = false,
}: {
  href: string;
  label: string;
  count: number;
  detail: string;
  urgent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 bg-surface p-4 transition-colors hover:bg-surface-2"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold transition-colors group-hover:text-primary">{label}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted">{detail}</p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
          count > 0
            ? urgent
              ? "bg-accent text-white"
              : "bg-primary/15 text-primary"
            : "bg-surface-2 text-muted"
        }`}
      >
        {count}
      </span>
    </Link>
  );
}

export function FilterPills({
  items,
}: {
  items: Array<{ href: string; label: string; active: boolean; count?: number }>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
            item.active
              ? "bg-primary text-white shadow-sm"
              : "border border-border bg-surface text-muted hover:border-primary hover:text-primary"
          }`}
        >
          {item.label}
          {typeof item.count === "number" && (
            <span className="ml-1.5 text-[11px] opacity-80">{item.count}</span>
          )}
        </Link>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  pages,
  hrefFor,
}: {
  page: number;
  pages: number;
  hrefFor: (page: number) => string;
}) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between text-sm">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className="btn-ghost">
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted">
        {page} / {pages}
      </span>
      {page < pages ? (
        <Link href={hrefFor(page + 1)} className="btn-ghost">
          Next
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}

const statusStyles: Record<SupportTicketStatus, string> = {
  Open: "bg-primary/15 text-primary",
  InProgress: "bg-primary/15 text-primary",
  Waiting: "bg-surface-2 text-muted",
  Resolved: "border border-primary/30 text-primary",
  Closed: "bg-surface-2 text-muted",
};

const priorityStyles: Record<SupportTicketPriority, string> = {
  Low: "bg-surface-2 text-muted",
  Normal: "bg-surface-2 text-foreground",
  High: "border border-accent/40 text-accent",
  Urgent: "bg-accent text-white",
};

export function TicketStatusBadge({ status }: { status: SupportTicketStatus }) {
  return (
    <span className={`badge ${statusStyles[status] ?? "bg-surface-2 text-muted"}`}>{status}</span>
  );
}

export function TicketPriorityBadge({ priority }: { priority: SupportTicketPriority }) {
  return (
    <span className={`badge ${priorityStyles[priority] ?? "bg-surface-2 text-muted"}`}>
      {priority}
    </span>
  );
}
