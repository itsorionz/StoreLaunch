import Link from "next/link";
import { Roles } from "@backend/lib/enums.mjs";
import { takeConversation } from "@backend/actions/chat";
import type { QueueItem } from "@backend/lib/chat";
import type { Dictionary } from "@frontend/i18n/dict";
import { ServiceFormButton } from "@frontend/components/service/service-form-button";
import { relativeTime } from "@frontend/components/service/service-ui";

// One open conversation in the dashboard's live queue: identity, badges, the
// last message preview, unread count and the claim/open control. Shared with
// any future inbox view.
export function QueueRow({ item, dict }: { item: QueueItem; dict: Dictionary }) {
  const taken = Boolean(item.agent);
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Link href={`/support/conversation/${item.id}`} className="group min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold transition-colors group-hover:text-primary">
              {item.customer.name}
            </span>
            {item.orderNumber && (
              <span className="badge badge-muted">
                {dict.service.order} #{item.orderNumber}
              </span>
            )}
            {item.subject && <span className="badge badge-primary">{item.subject}</span>}
            {!taken && <span className="badge-accent">{dict.service.unassigned}</span>}
            {item.mine && <span className="badge badge-primary">{dict.service.mine}</span>}
            {taken && !item.mine && (
              <span className="badge">
                {dict.service.claimedBy} {item.agent?.name}
              </span>
            )}
          </div>
          {item.preview && (
            <p className="mt-1.5 truncate text-sm text-muted">
              <span className="font-medium text-foreground">
                {item.preview.senderRole === Roles.Customer
                  ? item.customer.name
                  : dict.service.supportTeam}
                :
              </span>{" "}
              {item.preview.body}
            </p>
          )}
          <p className="mt-1 text-xs text-muted">
            {relativeTime(item.lastMessageAt)} {dict.service.ago}
          </p>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          {item.unread > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white">
              {item.unread}
            </span>
          )}
          {!taken ? (
            <ServiceFormButton
              action={takeConversation}
              fields={{ conversationId: item.id }}
              label={dict.service.take}
              pendingLabel={dict.service.taking}
              className="btn-primary"
            />
          ) : item.mine ? (
            <Link href={`/support/conversation/${item.id}`} className="btn-outline">
              {dict.service.open}
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}
