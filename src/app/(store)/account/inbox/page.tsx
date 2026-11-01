import { Suspense } from "react";
import { InboxContent } from "@frontend/components/account/inbox-content";

export const metadata = { title: "Inbox" };
export default function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; filter?: string; page?: string }>;
}) {
  return (
    <Suspense fallback={<div className="skeleton h-96 w-full rounded-2xl" />}>
      <InboxContent searchParams={searchParams} />
    </Suspense>
  );
}
