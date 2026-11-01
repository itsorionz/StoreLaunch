import { OrderStatuses, PaymentMethods, Roles } from "@backend/lib/enums.mjs";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@backend/lib/session";
import { Suspense } from "react";
import Link from "next/link";
import { db } from "@backend/lib/db";
import { formatPrice, orderCurrencyLabel } from "@backend/lib/money";

export const metadata = { title: "Order Result" };

async function ResultContent({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(`/order/${number}/result`)}`);
  const order = await db.order.findUnique({ where: { number }, include: { items: true } });
  if (!order || (order.userId !== user.id && user.role !== Roles.Admin)) notFound();

  const fresh = order;
  const paid = fresh && fresh.status !== OrderStatuses.Cancelled && fresh.paidAt !== null;
  const codPending =
    fresh &&
    fresh.paymentMethod === PaymentMethods.COD &&
    ([OrderStatuses.Pending, OrderStatuses.Shipped] as readonly string[]).includes(fresh.status) &&
    !paid;

  if ((paid || codPending) && fresh) {
    const dueCents = fresh.totalCents - fresh.walletPaidCents;
    return (
      <>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-light text-3xl text-primary">
          ✓
        </div>
        <h1 className="text-2xl font-bold text-primary-dark">
          {paid ? "Payment successful!" : "Order placed!"}
        </h1>
        <p className="mt-2 text-muted">
          Order <strong>{number}</strong> is confirmed. A confirmation message will be sent shortly.
        </p>
        {fresh.walletPaidCents > 0 && (
          <p className="mt-2 inline-block rounded-lg bg-muted px-3 py-1.5 text-sm font-medium text-foreground">
            {formatPrice(fresh.walletPaidCents, orderCurrencyLabel(order))} paid from your wallet
          </p>
        )}
        {codPending && (
          <p className="mt-2 inline-block rounded-lg bg-amber-500/10 px-3 py-1.5 text-sm font-semibold text-amber-600 dark:text-amber-400">
            Pay {formatPrice(dueCents, orderCurrencyLabel(order))} cash on delivery
          </p>
        )}
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-left">
          <ul className="space-y-2 text-sm">
            {fresh.items.map((i) => (
              <li key={i.id} className="flex justify-between">
                <span className="text-muted">
                  {i.name} × {i.quantity}
                </span>
                <span className="font-medium">
                  {formatPrice(i.priceCents * i.quantity, orderCurrencyLabel(order))}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between border-t border-border pt-3 font-bold">
            <span>Total</span>
            <span>{formatPrice(fresh.totalCents, orderCurrencyLabel(order))}</span>
          </p>
        </div>
        <Link
          href={`/account/orders/${order.number}`}
          className="mt-4 inline-block text-sm font-semibold text-primary"
        >
          View order and payment options
        </Link>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/account/orders"
            className="rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold hover:bg-muted"
          >
            My Orders
          </Link>
          <Link href="/products" className="btn-primary rounded-lg px-5 py-2.5 text-sm">
            Continue shopping
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-3xl text-accent">
        !
      </div>
      <h1 className="text-2xl font-bold">Payment not completed</h1>
      <p className="mt-2 text-muted">
        Order <strong>{number}</strong> is {fresh?.status ?? "unknown"}. Check My Orders or contact
        support before placing another order.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/cart" className="btn-primary rounded-lg px-5 py-2.5 text-sm">
          Back to cart
        </Link>
        <Link
          href="/account/orders"
          className="rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold hover:bg-muted"
        >
          My Orders
        </Link>
      </div>
    </>
  );
}

export default async function OrderResultPage({ params }: { params: Promise<{ number: string }> }) {
  return (
    <div className="w-full  px-4 py-12 text-center">
      <Suspense fallback={<div className="skeleton h-80 w-full rounded-2xl" />}>
        <ResultContent params={params} />
      </Suspense>
    </div>
  );
}
