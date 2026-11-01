"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { OrderStatuses, PaymentMethods, ReturnDispositions } from "@backend/lib/enums.mjs";
import {
  completeReturnToOriginAction,
  startReturnToOriginAction,
  type ReturnToOriginActionState,
} from "@backend/actions/return-to-origin";
import {
  ValidatedForm,
  ValidationInput,
  ValidationSelect,
  ValidationTextarea,
} from "@frontend/components/ui/validated-form";

function Feedback({ state }: { state: ReturnToOriginActionState }) {
  return (
    <>
      {state?.error && (
        <p role="alert" className="text-sm text-accent">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-sm text-primary">
          Saved. The order timeline has been updated.
        </p>
      )}
    </>
  );
}

export function ReturnToOriginConsole({
  orderId,
  status,
  paymentMethod,
  paidAt,
  totalCents,
  walletPaidCents,
  currency,
  attempts,
}: {
  orderId: string;
  status: string;
  paymentMethod: string;
  paidAt: boolean;
  totalCents: number;
  walletPaidCents: number;
  currency: string;
  attempts: number;
}) {
  const router = useRouter();
  const [startState, startAction, startPending] = useActionState(startReturnToOriginAction, null);
  const [receiveState, receiveAction, receivePending] = useActionState(
    completeReturnToOriginAction,
    null,
  );
  useEffect(() => {
    if (startState?.ok || receiveState?.ok) router.refresh();
  }, [startState?.ok, receiveState?.ok, router]);
  const gatewayRefund =
    paymentMethod === PaymentMethods.GATEWAY && paidAt
      ? Math.max(0, totalCents - walletPaidCents)
      : 0;

  if (status === OrderStatuses.Shipped)
    return (
      <section className="rounded-2xl border border-border bg-surface p-5 text-sm">
        <h2 className="font-bold">Failed delivery and return-to-origin</h2>
        {attempts > 0 ? (
          <>
            <p className="mt-2 text-muted">
              {attempts} failed delivery attempt{attempts === 1 ? "" : "s"} recorded. Review the
              attempt notes and retry plan before sending the parcel back.
            </p>
            <ValidatedForm
              action={startAction}
              errors={startState?.fieldErrors}
              result={startState}
              successMessage="Return-to-origin started."
              noValidate
              className="mt-4 space-y-3"
            >
              <input type="hidden" name="orderId" value={orderId} />
              <label className="block">
                Decision and reason
                <ValidationTextarea
                  name="reason"
                  className="input mt-1"
                  rows={3}
                  minLength={5}
                  maxLength={500}
                  required
                  placeholder="Why another delivery attempt is not appropriate"
                />
              </label>
              <Feedback state={startState} />
              <button className="btn-outline border-accent text-accent" disabled={startPending}>
                {startPending ? "Starting…" : "Start return-to-origin"}
              </button>
            </ValidatedForm>
          </>
        ) : (
          <p className="mt-2 text-muted">
            A rider must record a failed delivery attempt before return-to-origin can be started.
          </p>
        )}
      </section>
    );

  if (status === OrderStatuses.ReturningToOrigin)
    return (
      <section className="rounded-2xl border border-accent/30 bg-surface p-5 text-sm">
        <h2 className="font-bold">Parcel returning to store</h2>
        <p className="mt-2 text-muted">
          Confirm receipt only after the parcel physically reaches the store. Inspect its condition:
          resellable items return to available stock; damaged/write-off items stay out of stock. COD
          is not collected for an undelivered parcel.
        </p>
        {gatewayRefund > 0 && (
          <p className="mt-3 font-semibold">
            Online refund to complete externally: {currency}
            {(gatewayRefund / 100).toFixed(2)}
          </p>
        )}
        <ValidatedForm
          action={receiveAction}
          errors={receiveState?.fieldErrors}
          result={receiveState}
          successMessage="Parcel receipt recorded."
          noValidate
          className="mt-4 space-y-3"
        >
          <input type="hidden" name="orderId" value={orderId} />
          {gatewayRefund > 0 && (
            <label className="block">
              Gateway refund reference
              <ValidationInput
                name="externalReference"
                className="input mt-1"
                minLength={5}
                maxLength={100}
                required
                placeholder="Merchant refund reference"
              />
            </label>
          )}
          <label className="block">
            Returned parcel disposition
            <ValidationSelect name="disposition" className="input mt-1" defaultValue="">
              <option value="" disabled>
                Select after inspection
              </option>
              <option value={ReturnDispositions.Resellable}>
                Resellable: restore all order units to stock
              </option>
              <option value={ReturnDispositions.Damaged}>
                Damaged: keep units out of available stock
              </option>
              <option value={ReturnDispositions.WriteOff}>
                Write off: keep units out of available stock
              </option>
            </ValidationSelect>
          </label>
          <label className="block">
            Warehouse inspection note
            <ValidationTextarea
              name="conditionNote"
              className="input mt-1"
              minLength={5}
              maxLength={500}
              rows={3}
              required
              placeholder="Record package seal, item count and condition"
            />
          </label>
          <Feedback state={receiveState} />
          <button className="btn-primary" disabled={receivePending}>
            {receivePending ? "Saving…" : "Confirm store receipt and close order"}
          </button>
        </ValidatedForm>
      </section>
    );

  return null;
}
