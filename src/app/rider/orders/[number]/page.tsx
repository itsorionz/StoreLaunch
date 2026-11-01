import { OrderStatuses, PaymentMethods } from "@backend/lib/enums.mjs";
import { OrderAdditionalInfo } from "@frontend/components/orders/order-additional-info";
import { DeliveryMap } from "@frontend/components/rider/delivery-map";
import { DeliveryEvidence } from "@frontend/components/rider/delivery-evidence";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getRider } from "@backend/lib/session";
import { db } from "@backend/lib/db";
import { formatPrice, orderCurrencyLabel } from "@backend/lib/money";
import { RiderStatusButtons } from "@frontend/components/rider/rider-status-buttons";
import { RiderBack } from "@frontend/components/rider/rider-back";

const statusStyles: Record<string, string> = {
  [OrderStatuses.Pending]: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  [OrderStatuses.Paid]: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  [OrderStatuses.Shipped]: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  [OrderStatuses.Delivered]: "bg-primary/15 text-primary",
  [OrderStatuses.Cancelled]: "bg-muted text-muted",
};

async function RiderOrderDetail({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const ctx = await getRider();
  if (!ctx) redirect("/login?callbackUrl=/rider");

  const [order] = await Promise.all([
    db.order.findUnique({
      where: { number },
      include: {
        deliveryProof: {
          select: {
            id: true,
            orderId: true,
            riderId: true,
            receivedBy: true,
            relationship: true,
            note: true,
            photoKey: true,
            photoMime: true,
            createdAt: true,
          },
        },
        deliveryAttempts: { orderBy: { createdAt: "desc" } },
        codCollection: true,
        items: { include: { product: { select: { name: true } } } },
      },
    }),
  ]);
  if (!order || order.riderId !== ctx.rider.id) notFound();

  const codDue =
    order.paymentMethod === PaymentMethods.COD &&
    order.status !== OrderStatuses.Delivered &&
    order.status !== OrderStatuses.Cancelled
      ? order.totalCents - order.walletPaidCents
      : 0;

  return (
    <div className="space-y-4">
      <div>
        <RiderBack label="All orders" />
        <div className="mt-2 flex items-center gap-2">
          <h1 className="text-lg font-bold">#{order.number}</h1>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[order.status] ?? "bg-muted text-muted"}`}
          >
            {order.status}
          </span>
        </div>
      </div>

      <section className="card p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Customer</h2>
        <p className="mt-2 font-semibold">{order.recipientName}</p>
        {order.phone && (
          <a
            href={`tel:${order.phone}`}
            className="mt-0.5 block text-sm font-medium text-primary hover:underline"
          >
            {order.phone}
          </a>
        )}
        <p className="mt-1 text-sm text-muted">
          {[order.line1, order.line2, order.city, order.region, order.postal]
            .filter(Boolean)
            .join(", ")}
        </p>
        <div className="mt-3">
          <OrderAdditionalInfo text={order.additionalInfo} />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-bold">Find delivery address</h2>
        <DeliveryMap
          address={[order.line1, order.line2, order.city, order.region, order.postal]
            .filter(Boolean)
            .join(", ")}
        />
      </section>
      <DeliveryEvidence proof={order.deliveryProof} attempts={order.deliveryAttempts} />
      <section className="card divide-y divide-border">
        {order.items.map((it) => (
          <div key={it.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="min-w-0 flex-1 font-medium">{it.name}</span>
            <span className="shrink-0 text-muted">×{it.quantity}</span>
          </div>
        ))}
        <div className="flex items-center justify-between px-4 py-3 text-sm font-semibold">
          <span>Total</span>
          <span>{formatPrice(order.totalCents, orderCurrencyLabel(order))}</span>
        </div>
        {codDue > 0 && (
          <div className="flex items-center justify-between bg-accent/5 px-4 py-3 text-sm font-bold text-accent">
            <span>Collect on delivery</span>
            <span>{formatPrice(codDue, orderCurrencyLabel(order))}</span>
          </div>
        )}
      </section>

      {order.codCollection && (
        <section className="card p-4 text-sm">
          <h2 className="font-semibold">Cash collection</h2>
          <p className="mt-2">
            Collected{" "}
            {formatPrice(order.codCollection.amountCents, `${order.codCollection.currencyCode} `)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {order.codCollection.remittedAt
              ? "Store receipt confirmed"
              : "Awaiting store receipt confirmation"}
          </p>
        </section>
      )}
      <section className="card p-4">
        <RiderStatusButtons
          orderId={order.id}
          status={order.status}
          paymentMethod={order.paymentMethod}
          number={order.number}
        />
      </section>
    </div>
  );
}

export default function RiderOrderPage({ params }: { params: Promise<{ number: string }> }) {
  return (
    <Suspense fallback={<div className="skeleton h-72 w-full rounded-2xl" />}>
      <RiderOrderDetail params={params} />
    </Suspense>
  );
}
