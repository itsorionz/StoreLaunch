"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { orderAgain, type OrderAgainState } from "@backend/actions/order-again";
import { ActionResultToast } from "@frontend/components/ui/validated-form";

export function OrderAgainButton({ orderId }: { orderId: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formId = `order-again-${orderId}`;
  const [state, action, pending] = useActionState<OrderAgainState, FormData>(
    async (previous, formData) => {
      const result = await orderAgain(previous, formData);
      if (result?.ok) setConfirmOpen(false);
      return result;
    },
    null,
  );

  return (
    <>
      <ActionResultToast result={state} successMessage={state?.message ?? "Order added to cart."} />
      <form id={formId} action={action} data-order-again={orderId}>
        <input type="hidden" name="orderId" value={orderId} />
      </form>
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="rounded-lg border border-primary bg-primary/5 px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-light"
        >
          Order Again
        </button>
        {state?.error && !confirmOpen && (
          <p role="alert" className="text-xs text-accent">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <div role="status" className="space-y-2 text-xs">
            <p className="text-muted">{state.message}</p>
            <Link href="/cart" className="btn-primary inline-flex">
              Review cart
            </Link>
            <Link
              href="/products"
              className="ml-3 inline-flex font-semibold text-primary underline"
            >
              Continue shopping
            </Link>
          </div>
        )}
        {!!state?.warnings?.length && (
          <ul className="list-inside list-disc text-xs text-accent">
            {state.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        )}
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close reorder confirmation"
            onClick={() => setConfirmOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${formId}-title`}
            className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-surface text-foreground shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 id={`${formId}-title`} className="font-semibold">
                Reorder
              </h2>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={pending}
                aria-label="Close"
                className="btn-icon text-muted"
              >
                <CloseIcon />
              </button>
            </header>
            <div className="px-6 py-5 text-center">
              <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full text-primary">
                <InfoIcon />
              </span>
              <h3 className="mt-3 font-semibold">Are you sure?</h3>
              <p className="mt-2 text-sm leading-5 text-muted">
                Adding this order will replace the items currently in your cart. Would you like to
                continue?
              </p>
              <p className="mt-2 text-xs text-muted">
                You can review current prices and availability before checkout.
              </p>
              {state?.error && (
                <p role="alert" className="mt-3 text-sm text-accent">
                  {state.error}
                </p>
              )}
            </div>
            <footer className="flex gap-2 border-t border-border p-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={pending}
                className="btn-outline flex-1 justify-center"
              >
                Cancel
              </button>
              <button
                type="submit"
                form={formId}
                disabled={pending}
                className="btn-primary flex-1 justify-center"
              >
                {pending ? "Adding…" : "Confirm"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}

function InfoIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
    >
      <circle cx="20" cy="20" r="17" />
      <path d="M20 12v10M20 28h.01" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="m18 6-12 12M6 6l12 12" />
    </svg>
  );
}
