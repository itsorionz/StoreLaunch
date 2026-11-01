"use client";

import { useActionState } from "react";
import { AfterSalesKinds, AfterSalesStatuses, ReturnDispositions } from "@backend/lib/enums.mjs";
import {
  inspectAfterSalesAction,
  receiveAfterSalesAction,
  resolveCancellationAction,
  reviewAfterSalesAction,
  type AfterSalesActionState,
} from "@backend/actions/after-sales";
import {
  ValidatedForm,
  ValidationInput,
  ValidationSelect,
  ValidationTextarea,
} from "@frontend/components/ui/validated-form";

type Request = {
  id: string;
  kind: string;
  status: string;
  reason: string;
  customerNote: string | null;
  adminNote: string | null;
  items: {
    id: string;
    requestedQuantity: number;
    approvedQuantity: number | null;
    receivedQuantity: number | null;
    disposition: string | null;
    conditionNote: string | null;
    orderItem: { name: string; priceCents: number };
  }[];
};
function Result({ state }: { state: AfterSalesActionState }) {
  return (
    <>
      {state?.error && (
        <p role="alert" className="text-sm text-accent">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-sm text-primary">
          Saved. Refresh to review the next step.
        </p>
      )}
    </>
  );
}
export function AfterSalesConsole({
  request,
  externalRefundCents,
  refundCurrency,
}: {
  request: Request;
  externalRefundCents: number;
  refundCurrency: string;
}) {
  const [reviewState, reviewAction, reviewPending] = useActionState(reviewAfterSalesAction, null);
  const [receiveState, receiveAction, receivePending] = useActionState(
    receiveAfterSalesAction,
    null,
  );
  const [inspectState, inspectAction, inspectPending] = useActionState(
    inspectAfterSalesAction,
    null,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    resolveCancellationAction,
    null,
  );
  return (
    <section
      className="mt-5 rounded-2xl border border-border bg-surface p-5"
      data-after-sales-request={request.id}
    >
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="font-bold">
          {request.kind} · {request.status}
        </h3>
        <span className="text-xs text-muted">Request {request.id}</span>
      </div>
      <p className="mt-2 text-sm">{request.reason}</p>
      {request.customerNote && (
        <p className="mt-1 text-sm text-muted">Customer: {request.customerNote}</p>
      )}
      {request.adminNote && (
        <p className="mt-1 text-sm text-muted">Review note: {request.adminNote}</p>
      )}
      {request.items.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {request.items.map((item) => (
            <li key={item.id}>
              {item.orderItem.name} · requested {item.requestedQuantity} · approved{" "}
              {item.approvedQuantity ?? "pending"} · received {item.receivedQuantity ?? "pending"}
              {item.disposition ? ` · ${item.disposition}` : ""}
            </li>
          ))}
        </ul>
      )}
      {request.status === AfterSalesStatuses.Requested && (
        <ValidatedForm
          action={reviewAction}
          errors={reviewState?.fieldErrors}
          result={reviewState}
          successMessage="Request reviewed."
          noValidate
          className="mt-4 space-y-3 border-t border-border pt-4"
        >
          <input type="hidden" name="requestId" value={request.id} />
          {request.items.map((item) => (
            <label key={item.id} className="flex items-center justify-between gap-3 text-sm">
              Approve {item.orderItem.name} (requested {item.requestedQuantity})
              <ValidationInput
                className="input w-28"
                name={`approved:${item.id}`}
                type="number"
                min={0}
                max={item.requestedQuantity}
                placeholder="Quantity"
                defaultValue={String(item.requestedQuantity)}
              />
            </label>
          ))}
          <label className="block text-sm">
            Admin review note
            <ValidationTextarea
              className="input mt-1"
              name="adminNote"
              placeholder="Reason for approving or declining this request"
              rows={2}
              required
            />
          </label>
          <Result state={reviewState} />
          <div className="flex gap-2">
            <button
              className="btn-primary"
              name="decision"
              value="Approve"
              disabled={reviewPending}
            >
              Approve request
            </button>
            <button className="btn-outline" name="decision" value="Reject" disabled={reviewPending}>
              Decline request
            </button>
          </div>
        </ValidatedForm>
      )}
      {request.status === AfterSalesStatuses.Approved &&
        request.kind === AfterSalesKinds.Cancellation && (
          <ValidatedForm
            action={cancelAction}
            errors={cancelState?.fieldErrors}
            result={cancelState}
            successMessage="Cancellation recorded and order refunded."
            noValidate
            className="mt-4 space-y-3 border-t border-border pt-4"
          >
            <input type="hidden" name="requestId" value={request.id} />
            <p className="text-sm">
              If an online gateway amount was paid, issue the refund in the merchant portal first
              and record its reference. The wallet tender is refunded and stock released in the same
              transaction as cancellation.
            </p>
            {externalRefundCents > 0 && (
              <label className="block text-sm">
                Gateway refund to issue: {refundCurrency}
                {(externalRefundCents / 100).toFixed(2)}
                <ValidationInput
                  className="input mt-1"
                  name="externalReference"
                  placeholder="Merchant refund reference"
                  required
                />
              </label>
            )}
            <Result state={cancelState} />
            <button className="btn-primary" disabled={cancelPending}>
              Record refund and cancel order
            </button>
          </ValidatedForm>
        )}
      {request.status === AfterSalesStatuses.Approved &&
        request.kind !== AfterSalesKinds.Cancellation && (
          <ValidatedForm
            action={receiveAction}
            errors={receiveState?.fieldErrors}
            result={receiveState}
            successMessage="Warehouse receipt recorded."
            noValidate
            className="mt-4 space-y-3 border-t border-border pt-4"
          >
            <input type="hidden" name="requestId" value={request.id} />
            {request.items.map((item) => (
              <label key={item.id} className="flex items-center justify-between gap-3 text-sm">
                Received {item.orderItem.name} (approved {item.approvedQuantity})
                <ValidationInput
                  className="input w-28"
                  name={`received:${item.id}`}
                  type="number"
                  min={0}
                  max={item.approvedQuantity ?? 0}
                  placeholder="Quantity"
                  defaultValue={String(item.approvedQuantity ?? 0)}
                />
              </label>
            ))}
            <label className="block text-sm">
              Condition on receipt
              <ValidationTextarea
                className="input mt-1"
                name="conditionNote"
                placeholder="Record packaging, seal and item condition"
                rows={2}
              />
            </label>
            <Result state={receiveState} />
            <button className="btn-primary" disabled={receivePending}>
              Record warehouse receipt
            </button>
          </ValidatedForm>
        )}
      {request.status === AfterSalesStatuses.Received &&
        request.kind !== AfterSalesKinds.Cancellation && (
          <ValidatedForm
            action={inspectAction}
            errors={inspectState?.fieldErrors}
            result={inspectState}
            successMessage="Request resolved."
            noValidate
            className="mt-4 space-y-3 border-t border-border pt-4"
          >
            <input type="hidden" name="requestId" value={request.id} />
            {request.items.map((item) => (
              <label key={item.id} className="block text-sm">
                {item.orderItem.name}, received {item.receivedQuantity}
                <ValidationSelect
                  className="input mt-1"
                  name={`disposition:${item.id}`}
                  defaultValue={ReturnDispositions.WriteOff}
                >
                  <option value={ReturnDispositions.Resellable}>
                    Resellable: add back to stock
                  </option>
                  <option value={ReturnDispositions.Damaged}>Damaged: do not restock</option>
                  <option value={ReturnDispositions.WriteOff}>Write off: do not restock</option>
                </ValidationSelect>
              </label>
            ))}
            <p className="text-xs text-muted">
              For returns, wallet tender is refunded to the store wallet. Gateway or collected cash
              refunds must be completed externally first. For replacement requests, this action
              allocates replacement stock and creates a no-charge replacement order.
            </p>
            {externalRefundCents > 0 && (
              <label className="block text-sm">
                External refund to issue: {refundCurrency}
                {(externalRefundCents / 100).toFixed(2)}
                <ValidationInput
                  className="input mt-1"
                  name="externalReference"
                  placeholder="Bank, gateway or cash receipt reference"
                />
              </label>
            )}
            <Result state={inspectState} />
            <button className="btn-primary" disabled={inspectPending}>
              Inspect, record refund and resolve
            </button>
          </ValidatedForm>
        )}
    </section>
  );
}
