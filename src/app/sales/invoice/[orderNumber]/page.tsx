import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSalesPage } from "@backend/lib/session";
import { OrderSources } from "@backend/lib/enums.mjs";
import { getSalesInvoiceOrder } from "@backend/lib/sales-queries";
import { PrintButton } from "@frontend/components/sales/print-button";

export const metadata = { title: "Invoice" };

export default async function SalesInvoicePage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  await requireSalesPage();
  const { orderNumber } = await params;
  const order = await getSalesInvoiceOrder(orderNumber);
  if (!order || order.source !== OrderSources.SalesRep) notFound();

  const symbol = order.currencySymbol ?? "৳";
  const fmt = (cents: number) =>
    `${symbol}${(cents / 100).toLocaleString("en-BD", { minimumFractionDigits: 2 })}`;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href={`/sales/orders/${order.number}`}
          className="text-sm font-semibold text-accent hover:underline"
        >
          ← Back to order
        </Link>
        <PrintButton label="Print invoice" />
      </div>

      <div className="rounded-xl border border-border bg-surface p-8">
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <h1 className="text-lg font-black tracking-tight">StoreLaunch</h1>
            <p className="text-xs text-muted">Sales invoice</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-mono font-bold">{order.number}</p>
            <p className="text-muted">
              {order.createdAt.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}
            </p>
          </div>
        </div>

        <div className="grid gap-4 border-b border-border py-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Bill to</p>
            <p className="mt-1 font-semibold">{order.recipientName}</p>
            <p className="font-mono text-xs">{order.phone}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Payment</p>
            <p className="mt-1 font-semibold">
              {order.paidAt
                ? "Paid"
                : order.paymentMethod === "COD"
                  ? "Due on delivery"
                  : "Pending"}
            </p>
            <p className="text-xs text-muted">
              {order.paymentMethod === "COD" ? "Cash on delivery" : "Online"}
            </p>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 font-semibold">Item</th>
              <th className="py-2 text-right font-semibold">Qty</th>
              <th className="py-2 text-right font-semibold">Unit</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-border/40">
                <td className="py-2">{item.name}</td>
                <td className="py-2 text-right">{item.quantity}</td>
                <td className="py-2 text-right">{fmt(item.priceCents)}</td>
                <td className="py-2 text-right font-semibold">
                  {fmt(item.priceCents * item.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Subtotal</span>
            <span>{fmt(order.subtotalCents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Shipping</span>
            <span>{fmt(order.shippingCents)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-black">
            <span>Total</span>
            <span>{fmt(order.totalCents)}</span>
          </div>
        </div>

        {order.additionalInfo && (
          <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
            Note: {order.additionalInfo}
          </p>
        )}

        <p className="mt-6 text-center text-xs text-muted">
          Thank you for your purchase. Keep this invoice for support and returns.
        </p>
      </div>
    </div>
  );
}
