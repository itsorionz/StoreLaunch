import Link from "next/link";
import { getDict } from "@frontend/i18n/dict";
import { getService } from "@backend/lib/session";
import { listOpenConversations } from "@backend/lib/chat";
import { unstable_noStore } from "next/cache";
import { QueueRow } from "@frontend/components/service/queue-row";
import type { Dictionary } from "@frontend/i18n/dict";

export const metadata = { title: "Conversations — Support" };

export default async function AdminSupportConversationsPage() {
  unstable_noStore();
  const [agent, dict] = await Promise.all([getService(), getDict()]);
  if (!agent) return null;

  const conversations = await listOpenConversations(agent);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Conversations</h1>
        <Link href="/admin/support/tickets/new" className="btn-primary">
          New conversation
        </Link>
      </div>
      <div className="grid gap-3">
        {conversations.length ? (
          conversations.map((c) => (
            <QueueRow key={c.id} item={c} dict={dict as Dictionary} />
          ))
        ) : (
          <p className="text-muted">No open conversations.</p>
        )}
      </div>
    </div>
  );
}
