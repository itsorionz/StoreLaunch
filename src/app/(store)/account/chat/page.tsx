import { Suspense } from "react";
import { ChatPanel } from "@frontend/components/account/chat-panel";

export const metadata = { title: "Support Chat" };

export default function ChatPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  return (
    <Suspense fallback={<div className="skeleton h-96 w-full rounded-2xl" />}>
      <ChatPanel searchParams={searchParams} />
    </Suspense>
  );
}
