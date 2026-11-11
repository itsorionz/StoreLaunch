import { ReviewStatuses } from "@backend/lib/enums.mjs";
import { listReviews } from "@backend/lib/admin-people-queries";
import { ReviewModerationButtons } from "@frontend/components/admin/review-moderation-buttons";

export const metadata = { title: "Reviews — Admin" };

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const filters = await searchParams;
  const status = [ReviewStatuses.Pending, ReviewStatuses.Approved, ReviewStatuses.Hidden].find(
    (value) => value === filters.status,
  );
  const reviews = await listReviews(status);

  const tabs = ["ALL", ReviewStatuses.Pending, ReviewStatuses.Approved, ReviewStatuses.Hidden];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Reviews</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <a
            key={t}
            href={t === "ALL" ? "/admin/reviews" : `/admin/reviews?status=${t}`}
            className={`rounded-full px-3 py-1 text-sm font-medium ${(!status && t === "ALL") || status === t ? "bg-primary text-white" : "border border-border bg-surface hover:bg-surface-2"}`}
          >
            {t}
          </a>
        ))}
      </div>

      <ul className="space-y-3">
        {reviews.length === 0 && (
          <li className="rounded-2xl border border-border bg-surface p-8 text-center text-muted">
            No reviews.
          </li>
        )}
        {reviews.map((r) => (
          <li key={r.id} className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm">
                  <span className="font-semibold">{r.user.name}</span>
                  <span className="text-muted"> on </span>
                  <a href={`/products/${r.product.slug}`} className="text-primary hover:underline">
                    {r.product.name}
                  </a>
                </p>
                <p className="mt-1 text-sm text-amber-500">
                  {"★".repeat(r.rating)}
                  {"☆".repeat(5 - r.rating)}
                </p>
                {r.body && <p className="mt-1 text-sm text-foreground/80">{r.body}</p>}
                <p className="mt-1 text-xs text-muted">
                  {r.createdAt.toLocaleString()} · {r.status}
                </p>
              </div>
              <ReviewModerationButtons id={r.id} status={r.status} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
