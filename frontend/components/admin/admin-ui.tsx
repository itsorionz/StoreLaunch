import { EntityStatuses, OrderStatuses, ReviewStatuses } from "@backend/lib/enums.mjs";
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const statusStyles: Record<string, string> = {
  [OrderStatuses.Pending]: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  [OrderStatuses.Paid]: "bg-primary/15 text-primary",
  [OrderStatuses.Processing]: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  [OrderStatuses.Confirmed]: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  [OrderStatuses.Packing]: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  [OrderStatuses.Packed]: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  [OrderStatuses.Shipped]: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  [OrderStatuses.Delivered]: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  [OrderStatuses.Cancelled]: "bg-accent/15 text-accent",
  [EntityStatuses.Inactive]: "bg-surface-2 text-muted",
  [EntityStatuses.Active]: "bg-primary/15 text-primary",
  [ReviewStatuses.Hidden]: "bg-surface-2 text-muted",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${statusStyles[status] ?? "badge-muted"}`}>{status}</span>;
}
