import { InboxCategories } from "@backend/lib/enums.mjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@backend/lib/session";
import { getInbox } from "@backend/lib/inbox";
import { getDict } from "@frontend/i18n/dict";
import { InboxAction } from "@frontend/components/account/inbox-action";

type Params = Promise<{ tab?: string; filter?: string; page?: string }>;

export async function InboxContent({ searchParams }: { searchParams: Params }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/account/inbox");
  const params = await searchParams;
  const category =
    params.tab === "notification" ? InboxCategories.NOTIFICATION : InboxCategories.PROMOTION;
  const unreadOnly = params.filter === "unread";
  const requestedPage = Number(params.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [inbox, dict] = await Promise.all([
    getInbox(user.id, category, unreadOnly, page),
    getDict(),
  ]);
  const tab = category === InboxCategories.PROMOTION ? "promotion" : "notification";
  const currentUnread =
    category === InboxCategories.PROMOTION ? inbox.promotionUnread : inbox.notificationUnread;
  const href = (next: { tab?: string; filter?: string; page?: number }) =>
    `/account/inbox?${new URLSearchParams({ tab: next.tab ?? tab, filter: next.filter ?? (unreadOnly ? "unread" : "all"), page: String(next.page ?? 1) })}`;

  return (
    <div className="space-y-5" data-inbox>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{dict.inbox.title}</h1>
        <Link href="/offers" className="text-sm font-semibold text-primary">
          {dict.offers.browse}
        </Link>
        <p
          className="rounded-full bg-primary-light px-3 py-1.5 text-sm font-semibold text-primary"
          data-inbox-unread={inbox.promotionUnread + inbox.notificationUnread}
        >
          {dict.inbox.unread}: {inbox.promotionUnread + inbox.notificationUnread}
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        <nav aria-label={dict.inbox.title} className="flex border-b border-border">
          {(
            [
              ["promotion", dict.inbox.promotion, inbox.promotionUnread],
              ["notification", dict.inbox.notification, inbox.notificationUnread],
            ] as const
          ).map(([value, label, unread]) => (
            <Link
              key={value}
              href={href({ tab: value })}
              aria-current={tab === value ? "page" : undefined}
              className={`flex min-h-14 flex-1 items-center justify-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${tab === value ? "border-primary bg-primary-light text-primary" : "border-transparent text-muted hover:bg-surface-2 hover:text-foreground"}`}
            >
              {label}
              <span
                className="rounded-full bg-surface-2 px-2 py-0.5 text-xs"
                data-inbox-tab-unread={value}
              >
                {unread}
              </span>
            </Link>
          ))}
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-1 text-xs font-medium">
            {(
              [
                ["all", dict.inbox.all],
                ["unread", dict.inbox.unreadOnly],
              ] as const
            ).map(([value, label]) => (
              <Link
                key={value}
                href={href({ filter: value })}
                aria-current={(value === "unread") === unreadOnly ? "page" : undefined}
                className={`rounded-md px-3 py-2 ${(value === "unread") === unreadOnly ? "bg-surface text-primary shadow-sm" : "text-muted hover:text-foreground"}`}
              >
                {label}
              </Link>
            ))}
          </div>
          <InboxAction category={category} disabled={currentUnread === 0}>
            {dict.inbox.markAllRead}
          </InboxAction>
        </div>

        {inbox.messages.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <span
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-light text-primary"
              aria-hidden
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <path d="M3 14h5l2 3h4l2-3h5" />
              </svg>
            </span>
            <p className="font-semibold">
              {unreadOnly ? dict.inbox.emptyUnread : dict.inbox.empty}
            </p>
            <p className="mt-2 text-sm text-muted">{dict.inbox.emptyHint}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {inbox.messages.map((message) => (
              <li
                key={message.id}
                data-inbox-message={message.id}
                data-unread={message.readAt === null}
                className={`border-l-[3px] p-4 sm:p-5 ${message.readAt ? "border-l-transparent" : "border-l-primary bg-primary/5"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2
                    className={`min-w-0 break-words text-sm ${message.readAt ? "font-medium" : "font-bold"}`}
                  >
                    {message.title}
                  </h2>
                  <time dateTime={message.createdAt.toISOString()} className="text-xs text-muted">
                    {message.createdAt.toLocaleString(dict.lang === "bn" ? "bn-BD" : "en-GB", {
                      timeZone: "Asia/Dhaka",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-muted">
                  {message.body}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {message.href && (
                    <InboxAction id={message.id} read href={message.href}>
                      {dict.inbox.view}
                    </InboxAction>
                  )}
                  <InboxAction id={message.id} read={message.readAt === null}>
                    {message.readAt ? dict.inbox.markUnread : dict.inbox.markRead}
                  </InboxAction>
                  {!message.readAt && (
                    <span className="ml-auto flex items-center gap-1.5 text-xs font-medium text-primary">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      {dict.inbox.unread}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {inbox.pages > 1 && (
          <nav
            aria-label="Pagination"
            className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-sm"
          >
            {inbox.page > 1 ? (
              <Link href={href({ page: inbox.page - 1 })} className="btn-outline">
                {dict.inbox.previous}
              </Link>
            ) : (
              <span />
            )}
            <span className="text-muted">
              {dict.inbox.page} {inbox.page} / {inbox.pages}
            </span>
            {inbox.page < inbox.pages ? (
              <Link href={href({ page: inbox.page + 1 })} className="btn-outline">
                {dict.inbox.next}
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
