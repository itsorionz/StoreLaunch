import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@backend/lib/session";
import { getDict } from "@frontend/i18n/dict";
import { FeedbackForm } from "@frontend/components/account/feedback-form";
import { db } from "@backend/lib/db";

export const metadata = { title: "Suggest Products" };

async function SuggestContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/account/suggest");
  const dict = await getDict();
  const submissions = await db.feedback.findMany({
    where: { userId: user.id, kind: "suggest" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{dict.account.suggestTitle}</h1>
      <FeedbackForm kind="suggest" />
      {submissions.length > 0 && (
        <ul className="space-y-3" aria-label="Previous suggestions">
          {submissions.map((submission) => (
            <li key={submission.id} className="card p-4">
              <p className="whitespace-pre-wrap">{submission.message}</p>
              <time className="text-xs text-muted" dateTime={submission.createdAt.toISOString()}>
                {submission.createdAt.toLocaleDateString()}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SuggestPage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 w-full rounded-2xl" />}>
      <SuggestContent />
    </Suspense>
  );
}
