import { redirect } from "next/navigation";
import { getCurrentUser } from "@backend/lib/session";
import { findCustomerChatOrder, listCustomerConversations } from "@backend/lib/chat";
import { Roles } from "@backend/lib/enums.mjs";
import { getDict } from "@frontend/i18n/dict";
import { openChat, sendChatMessage } from "@backend/actions/chat";
import { ChatThread } from "@frontend/components/chat/chat-thread";
import { ChatComposer } from "@frontend/components/chat/chat-composer";
import { ChatRefresh } from "@frontend/components/chat/chat-refresh";

export async function ChatPanel({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/account/chat");
  const dict = await getDict();
  const isCustomer = user.role === Roles.Customer;
  const params = await searchParams;

  // Arriving from an order page (?order=<number>) links the thread to it; only
  // orders the signed-in customer owns are accepted.
  const order = params.order ? await findCustomerChatOrder(user.id, params.order) : null;

  const { open, closed } = await listCustomerConversations({ id: user.id, role: user.role });

  return (
    <div className="space-y-5">
      <ChatRefresh />
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">{dict.chat.title}</h1>
            {!open && <p className="mt-1 text-sm text-muted">{dict.chat.intro}</p>}
          </div>
          {open?.orderNumber && (
            <span className="badge badge-muted shrink-0">
              {dict.chat.aboutOrder} #{open.orderNumber}
            </span>
          )}
        </div>

        {open ? (
          <div className="mt-4 space-y-4">
            {open.subject && (
              <p className="badge badge-primary inline-flex max-w-full truncate">{open.subject}</p>
            )}
            <ChatThread
              messages={open.messages}
              viewerId={user.id}
              counterpartLabel={open.agent?.name ?? dict.chat.supportTeam}
              emptyLabel={dict.chat.empty}
            />
            {isCustomer ? (
              <ChatComposer
                action={sendChatMessage}
                conversationId={open.id}
                placeholder={dict.chat.placeholder}
                sendLabel={dict.chat.send}
              />
            ) : (
              <p className="text-sm text-muted">{dict.chat.waiting}</p>
            )}
          </div>
        ) : isCustomer ? (
          <div className="mt-4 space-y-3">
            {order && (
              <p className="badge badge-muted inline-flex">
                {dict.chat.aboutOrder} #{order.number}
              </p>
            )}
            <ChatComposer
              action={openChat}
              orderId={order?.id}
              subjectPlaceholder={dict.chat.subjectPlaceholder}
              placeholder={dict.chat.placeholder}
              sendLabel={dict.chat.send}
            />
            <p className="text-xs text-muted">{dict.chat.waiting}</p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">{dict.chat.intro}</p>
        )}
      </section>

      {closed.length > 0 && (
        <section className="card p-6">
          <h2 className="text-base font-semibold">{dict.chat.historyTitle}</h2>
          <ul className="mt-3 divide-y divide-border/60">
            {closed.map((conversation) => (
              <li
                key={conversation.id}
                className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {conversation.subject ||
                      conversation.preview?.body ||
                      dict.chat.newConversation}
                  </p>
                  {conversation.preview && (
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {conversation.preview.body}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right text-xs text-muted">
                  {conversation.orderNumber && (
                    <span className="block">
                      {dict.chat.aboutOrder} #{conversation.orderNumber}
                    </span>
                  )}
                  <span>
                    {conversation.closedAt?.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
