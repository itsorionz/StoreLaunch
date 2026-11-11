"use client";

import { OrderStatuses, PaymentMethods } from "@backend/lib/enums.mjs";
import { ORDER_STATUS_LABELS } from "@backend/lib/order-status";
import { useConfirm } from "@frontend/components/ui/confirm-dialog";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOrderStatus } from "@backend/actions/admin";
import { useToast } from "@frontend/components/ui/toast";

const transitions: Record<string, string[]> = {
  [OrderStatuses.Pending]: [],
  [OrderStatuses.Paid]: [OrderStatuses.Processing, OrderStatuses.Cancelled],
  [OrderStatuses.Processing]: [OrderStatuses.Confirmed, OrderStatuses.Cancelled],
  [OrderStatuses.Confirmed]: [OrderStatuses.Packing, OrderStatuses.Cancelled],
  [OrderStatuses.Packing]: [OrderStatuses.Packed, OrderStatuses.Cancelled],
  [OrderStatuses.Packed]: [OrderStatuses.Shipped, OrderStatuses.Cancelled],
  [OrderStatuses.Shipped]: [OrderStatuses.Delivered],
  [OrderStatuses.ReturningToOrigin]: [],
  [OrderStatuses.Delivered]: [],
  [OrderStatuses.Cancelled]: [],
};

export function OrderStatusButtons({
  orderId,
  status,
  paymentMethod,
  cashDueCents = 0,
}: {
  orderId: string;
  status: string;
  paymentMethod?: string;
  cashDueCents?: number;
}) {
  const [cashCollected, setCashCollected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const allowed =
    status === OrderStatuses.Pending
      ? paymentMethod === PaymentMethods.COD
        ? [OrderStatuses.Processing, OrderStatuses.Cancelled]
        : [OrderStatuses.Cancelled]
      : (transitions[status] ?? []);

  const externalRefundRequired =
    status !== OrderStatuses.Pending &&
    paymentMethod === PaymentMethods.GATEWAY &&
    cashDueCents > 0;
  const next = externalRefundRequired
    ? allowed.filter((value) => value !== OrderStatuses.Cancelled)
    : allowed;

  const primaryStatus = next.find((value) => value !== OrderStatuses.Cancelled);
  const needsCashConfirmation =
    status === OrderStatuses.Shipped && paymentMethod === PaymentMethods.COD && cashDueCents > 0;
  const actionLabels: Record<string, string> = {
    [OrderStatuses.Processing]: "Start processing",
    [OrderStatuses.Confirmed]: "Confirm order",
    [OrderStatuses.Packing]: "Start packing",
    [OrderStatuses.Packed]: "Mark as packed",
    [OrderStatuses.Shipped]: "Send for delivery",
    [OrderStatuses.Delivered]: "Mark as delivered",
    [OrderStatuses.Cancelled]: "Cancel order",
  };

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">Update order status</h2>
          <p className="mt-1 text-sm text-muted">
            Current:{" "}
            <span className="font-semibold text-foreground">
              {ORDER_STATUS_LABELS[status] ?? status}
            </span>
            {primaryStatus ? ` / Next: ${ORDER_STATUS_LABELS[primaryStatus]}` : ""}
          </p>
        </div>
        {!next.length && (
          <p className="text-sm text-muted">
            {status === OrderStatuses.Delivered
              ? "Delivery completed."
              : status === OrderStatuses.Cancelled
                ? "This order is closed."
                : "No status changes are available."}
          </p>
        )}
      </div>
      {status === OrderStatuses.Pending && paymentMethod === PaymentMethods.GATEWAY && (
        <p className="mb-3 text-sm text-muted">
          Waiting for payment confirmation before processing can begin.
        </p>
      )}
      {primaryStatus === OrderStatuses.Shipped && (
        <p className="mb-3 text-sm text-muted">
          Assign a rider or delivery company in the delivery section before dispatching.
        </p>
      )}
      {error && (
        <p role="alert" className="mb-3 text-sm text-accent">
          {error}
        </p>
      )}
      {externalRefundRequired && (
        <p className="mb-3 text-xs text-muted">
          Gateway-paid orders require an external refund workflow before cancellation. Contact the
          payment operations team.
        </p>
      )}
      {needsCashConfirmation && (
        <label className="mb-3 flex items-start gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={cashCollected}
            onChange={(event) => setCashCollected(event.target.checked)}
            className="mt-1"
          />
          I confirm the courier has collected the full cash amount due. Store remittance must be
          reconciled separately.
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {next.map((s) => (
          <button
            key={s}
            type="button"
            disabled={
              pending ||
              (s === OrderStatuses.Delivered &&
                paymentMethod === PaymentMethods.COD &&
                cashDueCents > 0 &&
                !cashCollected)
            }
            onClick={async () => {
              if (
                s === OrderStatuses.Cancelled &&
                !(await confirm({
                  title: "Cancel this order?",
                  description:
                    "Reserved stock will be released and eligible wallet payments refunded. This cannot be undone.",
                  confirmLabel: "Cancel order",
                  cancelLabel: "Keep order",
                }))
              )
                return;
              setError(null);
              startTransition(async () => {
                try {
                  const res = await updateOrderStatus(orderId, s, cashCollected);
                  if (!res.ok) {
                    const message = res.error ?? "Failed to update status";
                    setError(message);
                    toast(message, "error");
                    return;
                  }
                  toast(`Order updated: ${ORDER_STATUS_LABELS[s] ?? s}`);
                  setCashCollected(false);
                  router.refresh();
                } catch {
                  const message = "Could not save the status. Please try again.";
                  setError(message);
                  toast(message, "error");
                }
              });
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
              s === OrderStatuses.Cancelled
                ? "border border-accent bg-surface !text-accent hover:bg-accent/10"
                : "bg-primary hover:bg-primary-dark"
            }`}
          >
            {pending ? "Saving..." : (actionLabels[s] ?? ORDER_STATUS_LABELS[s] ?? s)}
          </button>
        ))}
      </div>
    </div>
  );
}
