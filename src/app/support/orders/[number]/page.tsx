import Link from "next/link";
import { notFound } from "next/navigation";
import { requireServicePage } from "@backend/lib/session";
import { getSupportOrderDetail, listOrderCustomerContext } from "@backend/lib/support-queries";
import { OrderStatuses, PaymentMethods, RefundStatuses } from "@backend/lib/enums.mjs";
import { formatPrice } from "@backend/lib/money";
import { ORDER_STATUS_LABELS } from "@backend/lib/order-status";
import { OrderTimeline } from "@frontend/components/orders/order-timeline";
import { OrderAdditionalInfo } from "@frontend/components/orders/order-additional-info";
import { DeliveryEvidence } from "@frontend/components/rider/delivery-evidence";
import { getDict } from "@frontend/i18n/dict";
import { TicketStatusBadge } from "@frontend/components/service/service-ui";

export const metadata = { title: "Order — Support" };

// Read-only order investigation screen (plan decision D6): everything an
// agent needs to answer "where is my order / why was I charged" — timeline,
// items, payment, after-sales, refunds — and nothing that mutates state.
export default async function SupportOrderDetailPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  await requireServicePage();
  const dict = await getDict();
  const order = await getSupportOrderDetail(number);
  if (!order) notFound();

  const orderCurrency =
    order.currencySymbol ||
    (order.currencyCode ? `${order.currencyCode} ` : "[currency unrecorded] ");

  const { conversations, customerTickets } = await listOrderCustomerContext(order.userId);

  const money = (cents: number) => formatPrice(cents, orderCurrency);

  return (
    <div className="animate-fade-up space-y-5">
      <div>
        <Link
          href="/support/orders"
          className="text-sm font-semibold text-primary transition-colors hover:underline"
        >
          ← Back to orders
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">#{order.number}</h1>
            <p className="mt-1 text-xs text-muted">Read-only · support cannot change order state</p>
          </div>
          <span className="rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold">
            {ORDER_STATUS_LABELS[order.status] ?? order.status}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={`/support/tickets/new?orderId=${order.id}`} className="btn-primary">
          + {dict.service.newTicket}
        </Link>
        <Link href={`/support/customers/${order.user.id}`} className="btn-outline">
          {dict.service.openCustomer}
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <section className="card p-5">
            <h2 className="mb-3 font-bold">Items</h2>
            <ul className="divide-y divide-border">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted">
                      {money(item.priceCents)} × {item.quantity}
                    </p>
                  </div>
                  <p className="font-semibold">{money(item.priceCents * item.quantity)}</p>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd>{money(order.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Delivery</dt>
                <dd>{order.shippingCents === 0 ? "Free" : money(order.shippingCents)}</dd>
              </div>
              {order.walletPaidCents > 0 && (
                <div className="flex justify-between text-primary">
                  <dt>Paid from wallet</dt>
                  <dd>− {money(order.walletPaidCents)}</dd>
                </div>
              )}
              <div className="flex justify-between font-bold">
                <dt>Total</dt>
                <dd>{money(order.totalCents)}</dd>
              </div>
            </dl>
            <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-sm">
              <p className="font-semibold">
                Payment:{" "}
                {order.paymentMethod === PaymentMethods.COD
                  ? "Cash on Delivery"
                  : "Online (SSLCommerz)"}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {order.paymentValId
                  ? `val_id: ${order.paymentValId}`
                  : order.status === OrderStatuses.Pending
                    ? order.paymentMethod === PaymentMethods.COD
                      ? `Collect ${money(order.totalCents - order.walletPaidCents)} on delivery`
                      : "Awaiting gateway payment"
                    : "—"}
                {order.paymentAttempt ? ` · attempt: ${order.paymentAttempt.status}` : ""}
              </p>
            </div>
          </section>

          <OrderTimeline events={order.events} internal currencyCode={order.currencyCode} />

          {order.afterSalesRequests.length > 0 && (
            <section className="card p-5 text-sm">
              <h2 className="font-bold">After-sales requests</h2>
              <ul className="mt-2 divide-y divide-border">
                {order.afterSalesRequests.map((request) => (
                  <li key={request.id} className="py-2.5">
                    <p className="font-medium">
                      {request.kind} · {request.status}
                    </p>
                    <p className="text-xs text-muted">
                      Requested{" "}
                      {request.requestedAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}
                      {request.reason ? ` · ${request.reason}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {order.refunds.length > 0 && (
            <section className="card p-5 text-sm">
              <h2 className="font-bold">Refund ledger</h2>
              <ul className="mt-2 divide-y divide-border">
                {order.refunds.map((refund) => (
                  <li key={refund.id} className="py-2">
                    <p className="font-medium">
                      {refund.tender}: {formatPrice(refund.amountCents, `${refund.currencyCode} `)}{" "}
                      ({refund.status === RefundStatuses.Completed ? "Completed" : refund.status})
                    </p>
                    <p className="text-xs text-muted">
                      {refund.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })} ·{" "}
                      {refund.completedByName}
                      {refund.externalReference ? ` · Ref ${refund.externalReference}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="card p-5 text-sm">
            <h2 className="mb-2 font-bold">{dict.service.customer}</h2>
            <p className="font-medium">{order.user.name}</p>
            <p className="text-muted">{order.user.email}</p>
            <p className="mt-2 font-medium">
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
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/support/customers/${order.user.id}`} className="btn-outline btn-sm">
                {dict.service.openCustomer}
              </Link>
              <span className="badge badge-muted">
                {customerTickets} open {dict.service.tickets}
              </span>
            </div>
          </section>

          <section className="card p-5 text-sm">
            <h2 className="mb-2 font-bold">Timeline</h2>
            <p>Placed: {order.createdAt.toLocaleString()}</p>
            {order.paidAt && <p>Paid: {order.paidAt.toLocaleString()}</p>}
            {order.shippedAt && <p>Shipped: {order.shippedAt.toLocaleString()}</p>}
            {order.deliveredAt && <p>Delivered: {order.deliveredAt.toLocaleString()}</p>}
          </section>

          <DeliveryEvidence proof={order.deliveryProof} attempts={order.deliveryAttempts} />

          <section className="card p-5 text-sm">
            <h2 className="mb-2 font-bold">Order tickets</h2>
            {order.supportTickets.length === 0 ? (
              <p className="text-xs text-muted">No tickets for this order yet.</p>
            ) : (
              <ul className="space-y-2">
                {order.supportTickets.map((ticket) => (
                  <li key={ticket.id}>
                    <Link
                      href={`/support/tickets/${ticket.number}`}
                      className="block transition-colors hover:text-primary"
                    >
                      <span className="text-xs text-muted">{ticket.number}</span>
                      <span className="block truncate font-medium">{ticket.subject}</span>
                    </Link>
                    <span className="mt-1 inline-block">
                      <TicketStatusBadge status={ticket.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={`/support/tickets/new?orderId=${order.id}`}
              className="mt-3 inline-block text-xs font-semibold text-primary hover:underline"
            >
              + {dict.service.newTicket}
            </Link>
          </section>

          <section className="card p-5 text-sm">
            <h2 className="mb-2 font-bold">Customer conversations</h2>
            {conversations.length === 0 ? (
              <p className="text-xs text-muted">No chat history for this customer.</p>
            ) : (
              <ul className="space-y-2">
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <Link
                      href={`/support/conversation/${conversation.id}`}
                      className="block truncate transition-colors hover:text-primary"
                    >
                      {conversation.subject || "Conversation"}
                      <span className="ml-2 text-[11px] text-muted">{conversation.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
