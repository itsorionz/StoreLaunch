import Link from "next/link";
import { redirect } from "next/navigation";
import { getService } from "@backend/lib/session";
import { listClosedConversations } from "@backend/lib/chat";
import { getDict } from "@frontend/i18n/dict";
import { ChatRefresh } from "@frontend/components/chat/chat-refresh";

export const metadata = { title: "Closed - Support" };

function formatDate(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SupportClosedPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const agent = await getService();
  if (!agent) redirect("/login?callbackUrl=/support");
  const dict = await getDict();
  const raw = Number((await searchParams).page ?? "1");
  const page = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
  const { items, total, pages } = await listClosedConversations(
    { id: agent.id, role: agent.role },
    page,
  );

  return (
    <div className="space-y-4">
      <ChatRefresh />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{dict.service.closed}</h1>
          <p className="mt-1 text-sm text-muted">{dict.service.closedHint}</p>
        </div>
        <span className="badge badge-muted">
          {total} {dict.service.total}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">{dict.service.closedEmpty}</div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="card p-4 transition-colors hover:border-primary/40">
              <Link href={`/support/conversation/${item.id}`} className="group block min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-semibold transition-colors group-hover:text-primary">
                      {item.customer.name}
                    </span>
                    {item.orderNumber && (
                      <span className="badge badge-muted">
                        {dict.service.order} #{item.orderNumber}
                      </span>
                    )}
                    {item.subject && <span className="badge badge-primary">{item.subject}</span>}
                    {item.agent && (
                      <span className="badge">
                        {dict.service.handledBy} {item.agent.name}
                      </span>
                    )}
                  </div>
                  {item.closedAt && (
                    <span className="shrink-0 text-xs text-muted">
                      {dict.service.closedAt}: {formatDate(item.closedAt)}
                    </span>
                  )}
                </div>
                {item.preview && (
                  <p className="mt-1.5 truncate text-sm text-muted">{item.preview.body}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={`/support/closed?page=${page - 1}`} className="btn-ghost">
              {dict.service.prev}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            {page} / {pages}
          </span>
          {page < pages ? (
            <Link href={`/support/closed?page=${page + 1}`} className="btn-ghost">
              {dict.service.next}
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
