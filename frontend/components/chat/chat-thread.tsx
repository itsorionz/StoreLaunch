import type { ChatMessageView } from "@backend/lib/chat";

// Plain-text message bubbles: mine on the right in brand green, theirs on the
// left on the card surface. React escapes the body, so raw text is safe.
export function ChatThread({
  messages,
  viewerId,
  counterpartLabel,
  emptyLabel,
}: {
  messages: ChatMessageView[];
  viewerId: string;
  counterpartLabel: string;
  emptyLabel: string;
}) {
  if (!messages.length)
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
        {emptyLabel}
      </p>
    );
  return (
    <ol className="max-h-[55vh] space-y-3 overflow-y-auto py-1">
      {messages.map((message) => {
        const mine = message.senderId === viewerId;
        return (
          <li key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 sm:max-w-[70%] ${
                mine ? "bg-primary text-white" : "border border-border bg-card"
              }`}
            >
              {!mine && (
                <p className="mb-0.5 text-xs font-semibold text-primary">{counterpartLabel}</p>
              )}
              <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
              <p className={`mt-1 text-right text-[10px] ${mine ? "text-white/70" : "text-muted"}`}>
                {message.createdAt.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
