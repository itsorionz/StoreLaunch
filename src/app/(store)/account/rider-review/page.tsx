import { OrderStatuses } from "@backend/lib/enums.mjs";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@backend/lib/session";
import { listAccountRiderReviewOrders } from "@backend/lib/account-queries";
import { getDict } from "@frontend/i18n/dict";
import { formatPrice } from "@backend/lib/money";
import { RiderReviewForm } from "@frontend/components/account/rider-review-form";

export const metadata = { title: "Rider Review" };

const statusStyles: Record<string, string> = {
  [OrderStatuses.Pending]: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  [OrderStatuses.Paid]: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  [OrderStatuses.Confirmed]: "bg-primary/15 text-primary",
  [OrderStatuses.Shipped]: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  [OrderStatuses.Delivered]: "bg-primary/15 text-primary",
  [OrderStatuses.Cancelled]: "bg-muted text-muted",
};

async function RiderReviewContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/account/rider-review");

  const [orders, dict] = await Promise.all([listAccountRiderReviewOrders(user.id), getDict()]);

  const purchased = orders.filter((o) => o.items.length > 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{dict.account.riderTitle}</h1>

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
                {order.items.map((item, idx) => (
                  <li
                    key={`${order.id}-${idx}`}
                    className="flex items-center gap-4 border-b border-border px-5 py-3"
                  >
                    <Link
                      href={`/products/${item.slug}`}
                      className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-surface-2"
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
                  </li>
                ))}
              </ul>

              <div className="border-t border-border bg-surface-2/50 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {dict.account.deliveryExperience}
                    </p>
                    {order.rider ? (
                      <p className="mt-1 text-sm font-medium">
                        {order.rider.name}{" "}
                        <span className="font-normal text-muted">· {order.rider.phone}</span>
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-muted">{dict.account.riderNotAssigned}</p>
                    )}
                  </div>

                  {order.rider &&
                    (order.riderReview ? (
                      <div className="space-y-1 text-right">
                        <p
                          className="text-sm text-amber-500"
                          aria-label={`${order.riderReview.rating} stars`}
                        >
                          {"★".repeat(order.riderReview.rating)}
                          <span className="text-muted">
                            {"★".repeat(5 - order.riderReview.rating)}
                          </span>
                        </p>
                        {order.riderReview.body && (
                          <p className="line-clamp-2 text-xs text-muted">
                            {order.riderReview.body}
                          </p>
                        )}
                        <p className="text-[11px] text-muted/70">
                          {dict.account.reviewedOn}{" "}
                          {order.riderReview.createdAt.toLocaleDateString()}
                        </p>
                      </div>
                    ) : (
                      <RiderReviewForm orderId={order.id} />
                    ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RiderReviewPage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 w-full rounded-2xl" />}>
      <RiderReviewContent />
    </Suspense>
  );
}
