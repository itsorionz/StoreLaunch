import { OrderStatuses, PaymentMethods } from "@backend/lib/enums.mjs";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRider } from "@backend/lib/session";
import { getRiderOrderProof } from "@backend/lib/rider-queries";
import { formatPrice, orderCurrencyLabel } from "@backend/lib/money";
import { DeliveryProofForm } from "@frontend/components/rider/delivery-forms";

export default async function RiderProofPage({ params }: { params: Promise<{ number: string }> }) {
  const ctx = await getRider();
  if (!ctx) redirect("/login?callbackUrl=/rider");
  const { number } = await params;
  const { order } = await getRiderOrderProof(number, ctx.rider.id);
  if (!order) notFound();
  const due =
    order.paymentMethod === PaymentMethods.COD
      ? Math.max(0, order.totalCents - order.walletPaidCents)
      : 0;
  return (
    <div className="space-y-4">
      <Link href={`/rider/orders/${number}`} className="text-sm text-primary">
        ← Delivery details
      </Link>
      <h1 className="text-2xl font-bold">Proof of delivery</h1>
      <p className="text-sm text-muted">
        #{number} · {order.recipientName}
      </p>
      {order.status === OrderStatuses.Shipped ? (
        <DeliveryProofForm
          orderId={order.id}
          cashDue={due ? formatPrice(due, orderCurrencyLabel(order)) : null}
        />
      ) : (
        <p className="card p-5">
          {order.status === OrderStatuses.Delivered
            ? "This delivery is already complete. View the handover record in delivery details."
            : "Collect and mark the parcel shipped before recording handover."}
        </p>
      )}
    </div>
  );
}
