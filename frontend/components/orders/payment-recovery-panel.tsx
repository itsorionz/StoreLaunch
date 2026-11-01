"use client";

import { useActionState } from "react";
import { PaymentAttemptStatuses } from "@backend/lib/enums.mjs";
import { manageOrderPayment } from "@backend/actions/payment";
import { ActionResultToast } from "@frontend/components/ui/validated-form";

export function PaymentRecoveryPanel({
  orderId,
  status,
  expiresAt,
  pendingOrder,
  admin = false,
}: {
  orderId: string;
  status: string;
  expiresAt: string;
  pendingOrder: boolean;
  admin?: boolean;
}) {
  const [state, action, pending] = useActionState(manageOrderPayment, null);
  const resumable =
    pendingOrder &&
    !admin &&
    ([PaymentAttemptStatuses.Created, PaymentAttemptStatuses.Ready] as readonly string[]).includes(
      status,
    );
  return (
    <section className="mt-5 rounded-2xl border border-border bg-surface p-5" data-payment-recovery>
      <ActionResultToast result={state} />
      <h2 className="font-bold">Online payment</h2>
      <p className="mt-1 text-sm text-muted">
        Payment status: {status}. Reservation deadline:{" "}
        {new Date(expiresAt).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })} (Bangladesh time).
      </p>
      {pendingOrder && (
        <p className="mt-2 text-sm text-muted">
          Continue the existing payment or check its status before placing another order. An
          uncertain payment keeps stock and wallet credit reserved until verified.
        </p>
      )}
      {status === PaymentAttemptStatuses.ReviewRequired && (
        <p className="mt-2 text-sm text-accent">
          Payment needs review. Contact the store if your bank or mobile wallet shows a debit.
        </p>
      )}
      {pendingOrder && (
        <form action={action} className="mt-3 flex flex-wrap gap-3">
          <input type="hidden" name="orderId" value={orderId} />
          {resumable && (
            <button className="btn-primary" name="operation" value="Resume" disabled={pending}>
              Continue payment
            </button>
          )}
          <button
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold"
            name="operation"
            value="Check"
            disabled={pending}
          >
            {pending ? "Checking..." : "Check payment status"}
          </button>
        </form>
      )}
      {state?.message && (
        <p role="status" className="mt-3 text-sm">
          {state.message}
        </p>
      )}
    </section>
  );
}
