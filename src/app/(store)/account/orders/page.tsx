import { getDict } from "@frontend/i18n/dict";
import { AppSearch, AppSearchForm } from "@frontend/components/layout/app-search";
import { appSearchSchema, orderTextWhere } from "@backend/lib/search-filters";
import { SearchContexts } from "@backend/lib/search-config.mjs";
import { OrderStatuses, PaymentMethods } from "@backend/lib/enums.mjs";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@backend/lib/session";
import { listAccountOrders } from "@backend/lib/account-queries";
import { formatPrice, orderCurrencyLabel } from "@backend/lib/money";
import { ORDER_STATUS_LABELS } from "@backend/lib/order-status";
import { OrderAdditionalInfo } from "@frontend/components/orders/order-additional-info";
import { OrderAgainButton } from "@frontend/components/orders/order-again-button";

export const metadata = { title: "My Orders" };

async function OrdersContent({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/account/orders");
  const dict = await getDict();
  const parsed = appSearchSchema.safeParse(await searchParams);
  if (!parsed.success) return <p role="alert">{dict.appSearch.invalid}</p>;
  const orders = await listAccountOrders(user.id, orderTextWhere(parsed.data.q));
  if (!orders.length)
    return (
      <div className="rounded-2xl border border-border bg-card p-12 text-center">
        <p className="font-semibold">{parsed.data.q ? dict.appSearch.empty : "No orders yet"}</p>
        <Link href="/products" className="btn-primary mt-3 inline-flex">
          Start shopping
        </Link>
      </div>
    );
  return (
    <ul className="space-y-5">
      {orders.map((order) => {
        const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
        const payment =
          order.status === OrderStatuses.Cancelled
            ? "Cancelled"
            : order.paidAt
              ? "Paid"
              : order.walletPaidCents > 0
                ? "Part paid"
                : "Unpaid";
        return (
          <li
            key={order.id}
            className="overflow-hidden rounded-xl border border-border bg-surface"
            data-customer-order={order.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
              <Link
                href={`/account/orders/${order.number}`}
                className="text-sm font-semibold text-primary hover:underline"
              >
                Order ID: #{order.number}
              </Link>
              <span className="rounded bg-surface-2 px-2 py-1 text-xs text-muted">
                {order.paymentMethod === PaymentMethods.COD ? "Cash on Delivery" : "Online payment"}
              </span>
            </div>
            <div className="space-y-4 px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted"
                    aria-hidden
                  >
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <rect x="3" y="7" width="18" height="14" rx="3" />
                      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a20 20 0 0 0 18 0M10 12h4" />
                    </svg>
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">{order.recipientName}</p>
                    <p className="mt-1 text-muted">{order.phone}</p>
                    <p className="mt-1 break-words leading-relaxed text-muted">
                      {[order.line1, order.line2, order.city, order.region, order.postal]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      {quantity} item{quantity === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <div className="space-y-3 text-sm sm:text-right">
                  <p className="text-xs text-muted">
                    Date:{" "}
                    {order.createdAt.toLocaleString("en-US", {
                      timeZone: "Asia/Dhaka",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <p className="font-semibold">
                    {formatPrice(order.totalCents, orderCurrencyLabel(order))}{" "}
                    <span className={payment === "Paid" ? "text-primary" : "text-muted"}>
                      ({payment})
                    </span>
                  </p>
                </div>
              </div>
              <OrderAdditionalInfo text={order.additionalInfo} />
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3 border-t border-border px-4 py-3 sm:px-5">
              <p className="flex items-center gap-2 pt-2 text-sm">
                Status:{" "}
                <span
                  className={`rounded px-2 py-1 text-xs font-medium ${order.status === OrderStatuses.Cancelled ? "bg-accent/10 text-accent" : "bg-primary-light text-primary"}`}
                >
                  {ORDER_STATUS_LABELS[order.status] ?? order.status}
                </span>
              </p>
              <div className="flex flex-wrap items-start gap-3">
                <Link
                  href={`/account/orders/${order.number}`}
                  className="py-2.5 text-sm font-medium text-primary hover:underline"
                >
                  View order
                </Link>
                <OrderAgainButton orderId={order.id} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
export default function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">My Orders</h1>
      <Suspense fallback={<AppSearchForm context={SearchContexts.orders} />}>
        <AppSearch context={SearchContexts.orders} />
      </Suspense>
      <Suspense fallback={<div className="skeleton h-48 w-full rounded-2xl" />}>
        <OrdersContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
