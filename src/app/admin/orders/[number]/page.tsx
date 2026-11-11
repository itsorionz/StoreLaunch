import { PaymentRecoveryPanel } from "@frontend/components/orders/payment-recovery-panel";
import {
  OrderStatuses,
  PaymentMethods,
  RefundStatuses,
  RefundTenders,
  AfterSalesKinds,
} from "@backend/lib/enums.mjs";
import { OrderAdditionalInfo } from "@frontend/components/orders/order-additional-info";
import { DeliveryEvidence } from "@frontend/components/rider/delivery-evidence";
import { requireAdminPage } from "@backend/lib/session";
import { CodRemittanceForm } from "@frontend/components/admin/reconciliation-forms";
import { OrderTimeline } from "@frontend/components/orders/order-timeline";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getDeliveryCompanyById,
  getOrderDetail,
  getRiderById,
  listActiveDeliveryCompanies,
  listActiveRiders,
} from "@backend/lib/admin-orders-queries";
import { formatPrice } from "@backend/lib/money";
import { ORDER_STATUS_LABELS } from "@backend/lib/order-status";
import { OrderStatusButtons } from "@frontend/components/admin/order-status-buttons";
import { DeliveryAssigner } from "@frontend/components/admin/delivery-assigner";
import { AfterSalesConsole } from "@frontend/components/admin/after-sales-console";
import { ReturnToOriginConsole } from "@frontend/components/admin/return-to-origin-console";

export const metadata = { title: "Order detail — Admin" };

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  await requireAdminPage();
  const { number } = await params;
  const [order, activeRiders, activeCompanies] = await Promise.all([
    getOrderDetail(number),
    listActiveRiders(),
    listActiveDeliveryCompanies(),
  ]);
  if (!order) notFound();
  const orderCurrency =
    order.currencySymbol ||
    (order.currencyCode ? `${order.currencyCode} ` : "[currency unrecorded] ");

  const riders =
    order.riderId && !activeRiders.some((r) => r.id === order.riderId)
      ? [...activeRiders, await getRiderById(order.riderId)].filter(
          (r): r is { id: string; name: string; phone: string } => r !== null,
        )
      : activeRiders;

  const companies =
    order.deliveryCompanyId && !activeCompanies.some((c) => c.id === order.deliveryCompanyId)
      ? [...activeCompanies, await getDeliveryCompanyById(order.deliveryCompanyId)].filter(
          (c): c is { id: string; name: string } => c !== null,
        )
      : activeCompanies;

  return (
    <div>
      <Link href="/admin/orders" className="text-sm text-primary hover:underline">
        ← Back to orders
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{order.number}</h1>
        <span className="rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold">
          {ORDER_STATUS_LABELS[order.status] ?? order.status}
        </span>
      </div>
      {order.replacementForOrder && (
        <p className="mt-2 text-sm text-muted">
          No-charge replacement for order{" "}
          <Link
            className="text-primary underline"
            href={`/admin/orders/${order.replacementForOrder.number}`}
          >
            {order.replacementForOrder.number}
          </Link>
        </p>
      )}

      <div className="mt-5">
        <OrderStatusButtons
          key={order.status}
          orderId={order.id}
          status={order.status}
          paymentMethod={order.paymentMethod}
          cashDueCents={Math.max(0, order.totalCents - order.walletPaidCents)}
        />
      </div>
      {order.afterSalesRequests.map((request) => {
        const records = order.afterSalesRequests
          .flatMap((item) => item.refunds)
          .filter((refund) => refund.status === RefundStatuses.Completed);
        const walletRemaining = Math.max(
          0,
          order.walletPaidCents -
            records
              .filter((refund) => refund.tender === RefundTenders.Wallet)
              .reduce((sum, refund) => sum + refund.amountCents, 0),
        );
        const returnValue = request.items.reduce(
          (sum, item) => sum + item.orderItem.priceCents * (item.receivedQuantity ?? 0),
          0,
        );
        const externalRefundCents =
          request.kind === AfterSalesKinds.Cancellation
            ? order.paymentMethod === PaymentMethods.GATEWAY &&
              order.status !== OrderStatuses.Pending
              ? Math.max(0, order.totalCents - order.walletPaidCents)
              : 0
            : Math.max(0, returnValue - walletRemaining);
        return (
          <AfterSalesConsole
            key={request.id}
            request={request}
            externalRefundCents={externalRefundCents}
            refundCurrency={orderCurrency}
          />
        );
      })}

      {order.paymentAttempt && (
        <PaymentRecoveryPanel
          orderId={order.id}
          status={order.paymentAttempt.status}
          expiresAt={order.paymentAttempt.expiresAt.toISOString()}
          pendingOrder={order.status === OrderStatuses.Pending}
          admin
        />
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-5 lg:col-span-2">
          <h2 className="mb-3 font-bold">Items</h2>
          <ul className="divide-y divide-border">
            {order.items.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium">{i.name}</p>
                  <p className="text-xs text-muted">
                    {formatPrice(i.priceCents, orderCurrency)} × {i.quantity}
                  </p>
                </div>
                <p className="font-semibold">
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
            {order.walletPaidCents > 0 && (
              <div className="flex justify-between text-primary">
                <dt>Paid from wallet</dt>
                <dd>− {formatPrice(order.walletPaidCents, orderCurrency)}</dd>
              </div>
            )}
            <div className="flex justify-between font-bold">
              <dt>Total</dt>
              <dd>{formatPrice(order.totalCents, orderCurrency)}</dd>
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
              {order.status === OrderStatuses.Pending && order.paymentMethod === PaymentMethods.COD
                ? `Collect ${formatPrice(order.totalCents - order.walletPaidCents, orderCurrency)} on delivery`
                : order.paymentValId
                  ? `val_id: ${order.paymentValId}`
                  : order.status === OrderStatuses.Pending
                    ? "Awaiting gateway payment"
                    : "—"}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-5 text-sm">
            <h2 className="mb-2 font-bold">Customer</h2>
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
          </div>
          <div className="rounded-2xl border border-border bg-surface p-5 text-sm">
            <h2 className="mb-2 font-bold">Timeline</h2>
            <p>Placed: {order.createdAt.toLocaleString()}</p>
            {order.paidAt && <p>Paid: {order.paidAt.toLocaleString()}</p>}
            {order.shippedAt && <p>Shipped: {order.shippedAt.toLocaleString()}</p>}
            {order.deliveredAt && <p>Delivered: {order.deliveredAt.toLocaleString()}</p>}
            {order.paymentValId && (
              <p className="mt-2 break-all text-xs text-muted">val_id: {order.paymentValId}</p>
            )}
          </div>
          <DeliveryEvidence proof={order.deliveryProof} attempts={order.deliveryAttempts} />
          <OrderTimeline events={order.events} internal currencyCode={order.currencyCode} />
          {order.paymentMethod === PaymentMethods.COD &&
            order.totalCents > order.walletPaidCents && (
              <section className="rounded-2xl border border-border bg-surface p-5 text-sm">
                <h2 className="font-bold">COD collection and store receipt</h2>
                {order.codCollection ? (
                  <>
                    <p className="mt-2 font-medium">
                      Collected:{" "}
                      {formatPrice(
                        order.codCollection.amountCents,
                        `${order.codCollection.currencyCode} `,
                      )}
                    </p>
                    {order.codCollection.settlementLines.length > 0 && (
                      <p className="mt-1 text-xs text-muted">
                        Store receipts recorded:{" "}
                        {formatPrice(
                          order.codCollection.settlementLines.reduce(
                            (sum, line) => sum + line.appliedCents,
                            0,
                          ),
                          `${order.codCollection.currencyCode} `,
                        )}{" "}
                        · Remaining:{" "}
                        {formatPrice(
                          Math.max(
                            0,
                            order.codCollection.amountCents -
                              order.codCollection.settlementLines.reduce(
                                (sum, line) => sum + line.appliedCents,
                                0,
                              ),
                          ),
                          `${order.codCollection.currencyCode} `,
                        )}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted">
                      {order.codCollection.courierName} ? Confirmed by{" "}
                      {order.codCollection.collectedByName}
                    </p>
                    <p className="text-xs text-muted">
                      {order.codCollection.collectedAt.toISOString().slice(0, 19).replace("T", " ")}{" "}
                      UTC
                    </p>
                    {order.codCollection.remittedAt ? (
                      <div className="mt-3 rounded-lg bg-primary-light p-3">
                        <p className="font-semibold">Received by store</p>
                        <p className="text-xs">
                          {order.codCollection.remittedByName} ?{" "}
                          {order.codCollection.remittanceReference}
                        </p>
                        <p className="text-xs">
                          {order.codCollection.remittedAt
                            .toISOString()
                            .slice(0, 19)
                            .replace("T", " ")}{" "}
                          UTC
                        </p>
                      </div>
                    ) : (
                      <CodRemittanceForm
                        orderId={order.id}
                        amount={formatPrice(
                          Math.max(
                            0,
                            order.codCollection.amountCents -
                              order.codCollection.settlementLines.reduce(
                                (sum, line) => sum + line.appliedCents,
                                0,
                              ),
                          ),
                          `${order.codCollection.currencyCode} `,
                        )}
                      />
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-xs text-muted">
                    {order.status === OrderStatuses.Delivered
                      ? "Historical collection evidence is unrecorded. Reconcile original records; delivery alone does not establish store receipt."
                      : order.status === OrderStatuses.Cancelled
                        ? "No cash collection recorded."
                        : "Awaiting cash collection on delivery."}
                  </p>
                )}
              </section>
            )}
          <DeliveryAssigner
            status={order.status}
            orderId={order.id}
            riderId={order.riderId}
            companyId={order.deliveryCompanyId}
            riders={riders}
            companies={companies}
          />
          <ReturnToOriginConsole
            orderId={order.id}
            status={order.status}
            paymentMethod={order.paymentMethod}
            paidAt={Boolean(order.paidAt)}
            totalCents={order.totalCents}
            walletPaidCents={order.walletPaidCents}
            currency={orderCurrency}
            attempts={order.deliveryAttempts.length}
          />
          {order.refunds.length > 0 && (
            <section className="rounded-2xl border border-border bg-surface p-5 text-sm">
              <h2 className="font-bold">Refund ledger</h2>
              <ul className="mt-2 divide-y divide-border">
                {order.refunds.map((refund) => (
                  <li key={refund.id} className="py-2">
                    <p className="font-medium">
                      {refund.tender}: {formatPrice(refund.amountCents, `${refund.currencyCode} `)}{" "}
                      ({refund.status})
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
      </div>
    </div>
  );
}
