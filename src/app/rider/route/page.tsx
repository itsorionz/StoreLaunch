import { PaymentMethods } from "@backend/lib/enums.mjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getRider } from "@backend/lib/session";
import { getRiderActiveRoute } from "@backend/lib/rider-queries";
import { DeliveryMap } from "@frontend/components/rider/delivery-map";
import { formatPrice, orderCurrencyLabel } from "@backend/lib/money";

export default async function RiderRoutePage() {
  const ctx = await getRider();
  if (!ctx) redirect("/login?callbackUrl=/rider/route");
  const { orders } = await getRiderActiveRoute(ctx.rider.id);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">My route</h1>
        <p className="mt-1 text-sm text-muted">
          {orders.length} stops out for delivery, grouped by city and dispatch time. Confirm each
          address with the customer.
        </p>
      </div>
      {!orders.length && (
        <div className="card p-6">
          No parcels out for delivery.{" "}
          <Link href="/rider" className="text-primary">
            Open deliveries to collect your next parcel.
          </Link>
        </div>
      )}
      <ol className="grid gap-4 xl:grid-cols-2">
        {orders.map((order, index) => {
          const latest = order.deliveryAttempts[0];
          const due =
            order.paymentMethod === PaymentMethods.COD
              ? Math.max(0, order.totalCents - order.walletPaidCents)
              : 0;
          return (
            <li key={order.id} className="card space-y-3 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-bold">
                  {index + 1}. {order.recipientName}
                </h2>
                <Link
                  href={`/rider/orders/${order.number}`}
                  className="text-sm font-semibold text-primary"
                >
                  #{order.number}
                </Link>
              </div>
              <p className="text-sm">
                {[order.line1, order.line2, order.city, order.region, order.postal]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              <a
                className="inline-block text-sm font-semibold text-primary"
                href={`tel:${order.phone}`}
              >
                Call {order.phone}
              </a>
              {due > 0 && (
                <p className="text-sm font-bold text-accent">
                  Collect {formatPrice(due, orderCurrencyLabel(order))}
                </p>
              )}
              {latest?.nextAttemptAt && (
                <p className="rounded-lg bg-primary-light p-3 text-sm">
                  Retry agreed:{" "}
                  {latest.nextAttemptAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })} (BD)
                </p>
              )}
              <DeliveryMap
                address={[order.line1, order.line2, order.city, order.region, order.postal]
                  .filter(Boolean)
                  .join(", ")}
                compact
              />
              <div className="flex flex-wrap gap-3 text-sm">
                <Link
                  href={`/rider/orders/${order.number}/proof`}
                  className="font-semibold text-primary"
                >
                  Record handover
                </Link>
                <Link href={`/rider/orders/${order.number}/attempt`} className="text-accent">
                  Delivery problem
                </Link>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
