import { OrderStatuses, ReviewStatuses } from "@backend/lib/enums.mjs";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@backend/lib/session";
import {
  listAccountProductReviews,
  listAccountReviewableOrders,
} from "@backend/lib/account-queries";
import { getDict } from "@frontend/i18n/dict";
import { formatPrice } from "@backend/lib/money";
import { ReviewForm } from "@frontend/components/account/review-form";

export const metadata = { title: "Product Review" };

const statusStyles: Record<string, string> = {
  [OrderStatuses.Pending]: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  [ReviewStatuses.Approved]: "bg-primary/15 text-primary",
  [ReviewStatuses.Hidden]: "bg-muted text-muted",
};

async function ReviewsContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/account/reviews");

  const [orders, reviews, dict] = await Promise.all([
    listAccountReviewableOrders(user.id),
    listAccountProductReviews(user.id),
    getDict(),
  ]);

  const reviewByProduct = new Map(reviews.map((r) => [r.productId, r]));
  const purchased = orders.filter((o) => o.items.length > 0);

  const labelFor = (status: string) =>
    status === ReviewStatuses.Approved
      ? dict.account.reviewApproved
      : status === ReviewStatuses.Hidden
        ? dict.account.reviewHidden
        : dict.account.reviewPending;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{dict.account.menuReviews}</h1>

      {purchased.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          {dict.account.noOrdersToReview}
          <div className="mt-4">
            <Link href="/products" className="btn-outline btn-sm">
              {dict.account.myOrdersCta}
            </Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-5">
          {purchased.map((order) => (
            <li key={order.id} className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2 px-5 py-3">
                <span className="text-sm font-semibold">
                  {dict.account.orderLabel} #{order.number}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {order.createdAt.toLocaleDateString()}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[order.status] ?? "bg-muted text-muted"}`}
                  >
                    {order.status}
                  </span>
                </span>
              </div>

              <ul>
                {order.items.map((item, idx) => {
                  const review = reviewByProduct.get(item.productId);
                  return (
                    <li
                      key={`${order.id}-${item.productId}-${idx}`}
                      className="flex flex-wrap items-start gap-4 border-b border-border px-5 py-4 last:border-b-0"
                    >
                      <Link
                        href={`/products/${item.slug}`}
                        className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-2"
                      >
                        <img
                          src={item.imageUrl ?? "/products/photo-spices.webp"}
                          alt={item.name}
                          className="h-full w-full object-contain p-1"
                        />
                      </Link>

                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/products/${item.slug}`}
                          className="line-clamp-1 text-sm font-semibold hover:text-primary"
                        >
                          {item.name}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted">
                          {formatPrice(item.priceCents)} × {item.quantity}
                        </p>
                      </div>

                      <div className="w-full min-w-[240px] sm:w-auto sm:max-w-[380px] sm:flex-1">
                        {review ? (
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p
                                className="text-sm text-amber-500"
                                aria-label={`${review.rating} stars`}
                              >
                                {"★".repeat(review.rating)}
                                <span className="text-muted">{"★".repeat(5 - review.rating)}</span>
                              </p>
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[review.status] ?? "bg-muted text-muted"}`}
                              >
                                {labelFor(review.status)}
                              </span>
                            </div>
                            {review.body && (
                              <p className="line-clamp-2 text-xs text-muted">{review.body}</p>
                            )}
                            <p className="text-[11px] text-muted/70">
                              {dict.account.reviewedOn} {review.createdAt.toLocaleDateString()}
                            </p>
                          </div>
                        ) : (
                          <ReviewForm productId={item.productId} />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ReviewsPage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 w-full rounded-2xl" />}>
      <ReviewsContent />
    </Suspense>
  );
}
