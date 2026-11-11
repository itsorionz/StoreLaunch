import { getFeedbackSubmissions } from "@backend/lib/admin-people-queries";
import { requireAdminPage } from "@backend/lib/session";

export const metadata = { title: "Customer feedback — Admin" };

export default async function AdminFeedbackPage() {
  await requireAdminPage();
  const submissions = await getFeedbackSubmissions();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Customer feedback</h1>
      {submissions.length === 0 && <p className="card p-6 text-muted">No feedback yet.</p>}
      {submissions.map((submission) => (
        <article key={submission.id} className="card space-y-2 p-5">
          <p className="font-semibold">
            {submission.user.name}{" "}
            <span className="text-sm font-normal text-muted">{submission.user.email}</span>
          </p>
          <p className="text-xs text-muted">
            {submission.kind === "suggest" ? "Product suggestion" : "Delivery feedback"} ·{" "}
            {submission.createdAt.toLocaleString()}
            {submission.rating ? ` · ${submission.rating}/5` : ""}
          </p>
          <p className="whitespace-pre-wrap">{submission.message}</p>
        </article>
      ))}
    </div>
  );
}
