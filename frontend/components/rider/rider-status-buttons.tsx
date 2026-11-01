"use client";
import { OrderStatuses, PaymentMethods } from "@backend/lib/enums.mjs";
import Link from "next/link";
import { useState, useTransition } from "react";
import { riderUpdateStatus } from "@backend/actions/rider";
import { useToast } from "@frontend/components/ui/toast";

export function RiderStatusButtons({
  orderId,
  number,
  status,
  paymentMethod,
}: {
  orderId: string;
  number: string;
  status: string;
  paymentMethod: string;
}) {
  const [current, setCurrent] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const canShip =
    current === OrderStatuses.Packed ||
    current === OrderStatuses.Paid ||
    (current === OrderStatuses.Pending && paymentMethod === PaymentMethods.COD);
  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      )}
      {canShip && (
        <>
          <p className="text-sm text-muted">
            Check the parcel items and mark shipped once the parcel is in your possession.
          </p>
          <button
            type="button"
            disabled={pending}
            className="btn-primary w-full"
            onClick={() =>
              startTransition(async () => {
                const result = await riderUpdateStatus(orderId, OrderStatuses.Shipped);
                if (result.ok) {
                  setCurrent(OrderStatuses.Shipped);
                  toast("Delivery marked as shipped.");
                } else {
                  const message = result.error ?? "Could not update delivery";
                  setError(message);
                  toast(message, "error");
                }
              })
            }
          >
            {pending ? "Updating?" : "Mark shipped"}
          </button>
        </>
      )}
      {current === OrderStatuses.Shipped && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href={`/rider/orders/${number}/proof`} className="btn-primary text-center">
            Proof of delivery
          </Link>
          <Link href={`/rider/orders/${number}/attempt`} className="btn-outline text-center">
            Record delivery attempt
          </Link>
        </div>
      )}
      {(
        [
          OrderStatuses.Processing,
          OrderStatuses.Confirmed,
          OrderStatuses.Packing,
        ] as readonly string[]
      ).includes(current) && (
        <p className="text-sm text-muted">
          The store is preparing this parcel. Collect it after the order is marked packed.
        </p>
      )}
      {!(
        [
          OrderStatuses.Pending,
          OrderStatuses.Paid,
          OrderStatuses.Processing,
          OrderStatuses.Confirmed,
          OrderStatuses.Packing,
          OrderStatuses.Packed,
          OrderStatuses.Shipped,
        ] as readonly string[]
      ).includes(current) && (
        <p className="text-sm text-muted">No delivery action needed for this order.</p>
      )}
      {current === OrderStatuses.Pending && paymentMethod !== PaymentMethods.COD && (
        <p className="text-sm text-muted">
          Awaiting verified payment. Contact dispatch before collecting this parcel.
        </p>
      )}
    </div>
  );
}
