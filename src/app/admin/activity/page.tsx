import Link from "next/link";
import { requireAdminPage } from "@backend/lib/session";
import { getStoreSettings } from "@backend/lib/settings";
import { getActivityTrail, type ActivityKind } from "@backend/lib/owner-insights";
import { formatPrice } from "@backend/lib/money";
import { PageHeader } from "@frontend/components/admin/admin-ui";

export const metadata = { title: "Activity trail — Admin" };

const kindBadges: Record<ActivityKind, { label: string; className: string }> = {
  order: { label: "Order", className: "bg-primary/15 text-primary" },
  account: { label: "Account", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  stock: { label: "Stock", className: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" },
  cash: { label: "Cash", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
};

const kindOptions: { value: string; label: string }[] = [
  { value: "all", label: "All activity" },
  { value: "order", label: "Orders" },
  { value: "account", label: "Accounts" },
  { value: "stock", label: "Stock" },
  { value: "cash", label: "Cash & settlements" },
];

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string; kind?: string }>;
}) {
  await requireAdminPage();
  const params = await searchParams;
  const kind = (["order", "account", "stock", "cash"] as const).includes(
    params.kind as ActivityKind,
  )
    ? (params.kind as ActivityKind)
    : "all";
  const actor = params.actor?.trim() || undefined;

  const [entries, settings] = await Promise.all([
    getActivityTrail({ limit: 50, kind, actor }),
    getStoreSettings(),
  ]);
  const when = (value: Date) =>
    value.toLocaleString("en-GB", {
      timeZone: "Asia/Dhaka",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Activity trail"
        subtitle="Who did what, when — orders, accounts, stock adjustments and cash receipts across the store (last 90 days)"
      />

      <form
        method="get"
        action="/admin/activity"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3"
      >
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Actor</span>
          <input
            type="text"
            name="actor"
            defaultValue={params.actor ?? ""}
            placeholder="Filter by staff name…"
            className="input w-56"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Kind</span>
          <select name="kind" defaultValue={kind} className="input w-48">
            {kindOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-primary">
          Apply filters
        </button>
        {(actor || kind !== "all") && (
          <Link href="/admin/activity" className="btn-outline">
            Clear
          </Link>
        )}
      </form>

      <section className="card overflow-hidden" aria-label="Activity entries">
        {entries.length ? (
          <ul className="divide-y divide-border">
            {entries.map((entry) => {
              const badge = kindBadges[entry.kind];
              const body = (
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{entry.summary}</span>
                    {entry.detail && (
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {entry.detail}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs font-medium text-muted">
                    {entry.actorName}
                    <span className="ml-1 font-normal text-muted/70">({entry.actorRole})</span>
                  </span>
                  {entry.amountCents !== null && (
                    <span className="shrink-0 text-sm font-bold">
                      {formatPrice(
                        entry.amountCents,
                        entry.currencyLabel ?? settings.currencySymbol,
                      )}
                    </span>
                  )}
                  <span className="w-28 shrink-0 text-right text-xs text-muted">
                    {when(entry.at)}
                  </span>
                </div>
              );
              return (
                <li key={entry.id}>
                  {entry.href ? (
                    <Link
                      href={entry.href}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-5 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 py-12 text-center text-sm text-muted">
            No activity matches these filters.{" "}
            {actor && (
              <>
                Try a different actor name, or{" "}
                <Link href="/admin/activity" className="text-primary underline">
                  clear the filters
                </Link>
                .
              </>
            )}
          </p>
        )}
      </section>

      <p className="text-xs leading-relaxed text-muted">
        Sources: order timeline events, account status changes, inventory adjustments and COD
        settlement receipts. Showing the latest 50 entries.{" "}
        {actor && <span className="font-medium text-foreground">Filtered by actor “{actor}”.</span>}
      </p>
    </div>
  );
}
