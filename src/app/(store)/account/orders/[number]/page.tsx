import { PaymentRecoveryPanel } from "@frontend/components/orders/payment-recovery-panel";
import { AfterSalesStatuses, OrderStatuses, Roles } from "@backend/lib/enums.mjs";
import { AfterSalesRequestForm } from "@frontend/components/orders/after-sales-request-form";
import { AfterSalesRequestStatus } from "@frontend/components/orders/after-sales-request-status";
import { OrderAgainButton } from "@frontend/components/orders/order-again-button";
import { OrderAdditionalInfo } from "@frontend/components/orders/order-additional-info";
import { OrderTimeline } from "@frontend/components/orders/order-timeline";
import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@backend/lib/session";
import { getCustomerOrderByNumber } from "@backend/lib/account-queries";
import { formatPrice } from "@backend/lib/money";
import { getStoreSettings } from "@backend/lib/settings";
import { ORDER_STATUS_LABELS, PRE_DISPATCH_STATUSES } from "@backend/lib/order-status";

export const metadata = { title: "Order" };

async function OrderContent({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [order] = await Promise.all([getCustomerOrderByNumber(number)]);
  if (!order || order.userId !== user.id) notFound();
  const storeSettings = await getStoreSettings();
  const activeAfterSales = order.afterSalesRequests.some(
    (request) =>
      request.status !== AfterSalesStatuses.Rejected &&
      request.status !== AfterSalesStatuses.Resolved,
  );
  const returnWindowDays = storeSettings.returnWindowDays;
  const returnWindowDeadline =
    returnWindowDays > 0 && !order.replacementForOrderId && order.deliveredAt
      ? new Date(order.deliveredAt.getTime() + returnWindowDays * 86400000)
      : null;
  const cancellationAllowed =
    user.role === Roles.Customer &&
    !activeAfterSales &&
    (PRE_DISPATCH_STATUSES as readonly string[]).includes(order.status);
  const returnAllowed =
    user.role === Roles.Customer &&
    !activeAfterSales &&
    order.status === OrderStatuses.Delivered &&
    returnWindowDeadline !== null &&
    returnWindowDeadline >= new Date();
  const returnWindowClosedOn =
    !activeAfterSales &&
    order.status === OrderStatuses.Delivered &&
    returnWindowDeadline !== null &&
    returnWindowDeadline < new Date()
      ? returnWindowDeadline.toISOString()
      : null;
  const orderCurrency =
    order.currencySymbol ||
    (order.currencyCode ? `${order.currencyCode} ` : "[currency unrecorded] ");

  return (
    <>
      <Link href="/account/orders" className="text-sm text-primary hover:underline">
        ← Back to orders
      </Link>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{order.number}</h1>
        <span className="rounded-full bg-primary-light px-3 py-1 text-sm font-semibold text-primary-dark">
          {ORDER_STATUS_LABELS[order.status] ?? order.status}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        Placed {order.createdAt.toISOString().slice(0, 16).replace("T", " ")}
      </p>
      <div className="mt-4">
        <OrderTimeline
          events={order.events}
          status={order.status}
          currencyCode={order.currencyCode}
          paymentMethod={order.paymentMethod}
          number={order.number}
          rider={order.rider}
        />
      </div>
      <AfterSalesRequestStatus requests={order.afterSalesRequests} orderCurrency={orderCurrency} />

      {order.paymentAttempt && (
        <PaymentRecoveryPanel
          orderId={order.id}
          status={order.paymentAttempt.status}
          expiresAt={order.paymentAttempt.expiresAt.toISOString()}
          pendingOrder={order.status === OrderStatuses.Pending}
        />
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
          <h2 className="mb-3 font-bold">Items</h2>
          <ul className="space-y-3">
            {order.items.map((i) => (
              <li key={i.id} className="flex items-center gap-3">
                <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                  <Image
                    src={i.imageUrl ?? "/products/photo-spices.webp"}
                    alt={i.name}
                    fill
                    sizes="48px"
                    className="object-contain p-1"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/products/${i.slug}`}
                    className="line-clamp-1 text-sm font-medium hover:text-primary"
                  >
                    {i.name}
                  </Link>
                  <p className="text-xs text-muted">× {i.quantity}</p>
                </div>
                <p className="text-sm font-semibold">
                  {formatPrice(i.priceCents * i.quantity, orderCurrency)}
                </p>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd>{formatPrice(order.subtotalCents, orderCurrency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Delivery</dt>
              <dd>
                {order.shippingCents === 0
                  ? "Free"
                  : formatPrice(order.shippingCents, orderCurrency)}
              </dd>
            </div>
            <div className="flex justify-between font-bold">
              <dt>Total</dt>
              <dd>{formatPrice(order.totalCents, orderCurrency)}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 text-sm">
            <h2 className="mb-2 font-bold">Delivery to</h2>
            <p className="font-medium">
              {order.recipientName} · {order.phone}
            </p>
            <p className="text-muted">
              {[order.line1, order.line2, order.city, order.region, order.postal]
                .filter(Boolean)
                .join(", ")}
            </p>
            <div className="mt-3">
              <OrderAdditionalInfo text={order.additionalInfo} />
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 text-sm">
            <h2 className="mb-2 font-bold">Delivery</h2>
            {order.rider ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Delivery partner
                </p>
                <p className="font-medium">{order.rider.name}</p>
                <p className="text-muted">{order.rider.phone}</p>
              </>
            ) : order.deliveryCompany ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Delivery company
                </p>
                <p className="font-medium">{order.deliveryCompany.name}</p>
                {order.deliveryCompany.phone && (
                  <p className="text-muted">{order.deliveryCompany.phone}</p>
                )}
                {order.deliveryCompany.trackingUrl && (
                  <a
                    href={order.deliveryCompany.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block font-medium text-primary hover:underline"
                  >
                    Track order →
                  </a>
                )}
              </>
            ) : (
              <p className="text-muted">No delivery assigned yet.</p>
            )}
          </div>
        </div>
      </div>
      <div className="mt-6">
        <OrderAgainButton orderId={order.id} />
      </div>
      <AfterSalesRequestForm
        orderId={order.id}
        items={order.items.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          priceCents: item.priceCents,
        }))}
        cancellationAllowed={cancellationAllowed}
        returnAllowed={returnAllowed}
        currencySymbol={orderCurrency}
        activeRequest={activeAfterSales}
        returnWindowClosedOn={returnWindowClosedOn}
      />
    </>
  );
}

export default async function OrderDetailPage({ params }: { params: Promise<{ number: string }> }) {
  return (
    <div>
      <Suspense fallback={<div className="skeleton h-96 w-full rounded-2xl" />}>
        <OrderContent params={params} />
      </Suspense>
    </div>
  );
}
