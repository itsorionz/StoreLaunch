import { OrderStatuses } from "@backend/lib/enums.mjs";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@backend/lib/db";
import { getRider } from "@backend/lib/session";
import { DeliveryAttemptForm } from "@frontend/components/rider/delivery-forms";

export default async function RiderAttemptPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const ctx = await getRider();
  if (!ctx) redirect("/login?callbackUrl=/rider");
  const { number } = await params;
  const order = await db.order.findFirst({ where: { number, riderId: ctx.rider.id } });
  if (!order) notFound();
  return (
    <div className="space-y-4">
      <Link href={`/rider/orders/${number}`} className="text-sm text-primary">
        ← Delivery details
      </Link>
      <h1 className="text-2xl font-bold">Record delivery attempt</h1>
      <p className="text-sm text-muted">
        #{number} · {order.recipientName}
      </p>
      {order.status === OrderStatuses.Shipped ? (
        <DeliveryAttemptForm orderId={order.id} />
      ) : (
        <p className="card p-5">Attempts can be recorded for parcels out for delivery.</p>
      )}
    </div>
  );
}
