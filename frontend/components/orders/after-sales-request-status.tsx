import Link from "next/link";
import { AfterSalesKinds, AfterSalesStatuses, RefundStatuses } from "@backend/lib/enums.mjs";
import { formatPrice } from "@backend/lib/money";
import {
  AFTER_SALES_KIND_LABELS,
  AFTER_SALES_STEPS,
  AFTER_SALES_STATUS_LABELS,
  ACTIVE_AFTER_SALES_STATUSES,
} from "@backend/lib/order-status";

export type AfterSalesRequestView = {
  id: string;
  kind: string;
  status: string;
  reason: string;
  customerNote: string | null;
  adminNote: string | null;
  externalRefundReference: string | null;
  requestedAt: Date;
  reviewedAt: Date | null;
  receivedAt: Date | null;
  resolvedAt: Date | null;
  items: {
    id: string;
    requestedQuantity: number;
    approvedQuantity: number | null;
    receivedQuantity: number | null;
    disposition: string | null;
    orderItem: { name: string };
  }[];
  refunds: {
    id: string;
    tender: string;
    status: string;
    amountCents: number;
    externalReference: string | null;
  }[];
  replacementOrder: { number: string } | null;
};

const statusBadge: Record<string, string> = {
  [AfterSalesStatuses.Requested]: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  [AfterSalesStatuses.Approved]: "bg-primary/15 text-primary",
  [AfterSalesStatuses.Received]: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  [AfterSalesStatuses.Inspected]: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  [AfterSalesStatuses.Resolved]: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  [AfterSalesStatuses.Rejected]: "bg-accent/15 text-accent",
};

const refundTenders: Record<string, string> = {
  Wallet: "Wallet refund",
  Gateway: "Gateway refund",
  Cash: "Cash refund",
};

const dispositions: Record<string, string> = {
  Resellable: "Restocked",
  Damaged: "Not restocked (damaged)",
  WriteOff: "Not restocked (written off)",
};

function formatDay(value: Date | null) {
  if (!value) return null;
  return value.toLocaleDateString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function progress(status: string, steps: readonly string[]) {
  if (status === AfterSalesStatuses.Rejected) return { done: 1, current: -1, declined: true };
  if (status === AfterSalesStatuses.Requested) return { done: 0, current: 0, declined: false };
  if (status === AfterSalesStatuses.Approved)
    return {
      done: Math.min(2, steps.length),
      current: Math.min(2, steps.length - 1),
      declined: false,
    };
  if (status === AfterSalesStatuses.Received || status === AfterSalesStatuses.Inspected)
    return {
      done: Math.min(3, steps.length),
      current: Math.min(3, steps.length - 1),
      declined: false,
    };
  return { done: steps.length, current: -1, declined: false };
}

function StepRail({ request }: { request: AfterSalesRequestView }) {
  const steps = AFTER_SALES_STEPS[request.kind] ?? [];
  const { done, current, declined } = progress(request.status, steps);
  return (
    <ol className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2">
      {steps.map((label, index) => {
        const isDone = index < done;
        const isCurrent = index === current;
        const isDeclined = declined && index === done;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                isDeclined
                  ? "bg-accent text-white"
                  : isDone
                    ? "bg-primary text-white"
                    : isCurrent
                      ? "border-2 border-primary bg-card text-primary ring-4 ring-primary/15"
                      : "border border-border bg-card text-muted"
              }`}
            >
              {isDeclined ? "!" : isDone ? "✓" : index + 1}
            </span>
            <span
              className={`text-xs ${isCurrent || isDeclined ? "font-semibold" : isDone ? "text-foreground" : "text-muted"}`}
            >
              {label}
            </span>
            {index < steps.length - 1 && <span aria-hidden className="h-px w-5 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

export function AfterSalesRequestStatus({
  requests,
  orderCurrency,
}: {
  requests: AfterSalesRequestView[];
  orderCurrency: string;
}) {
  if (!requests.length) return null;
  return (
    <section
      className="mt-6 rounded-2xl border border-border bg-surface p-5"
      data-after-sales-status
    >
      <h2 className="font-bold">Return and replacement requests</h2>
      <p className="mt-1 text-sm text-muted">
        Each request is reviewed by the store. You are notified at every step.
      </p>
      <ul className="mt-4 space-y-4">
        {requests.map((request) => {
          const active = ACTIVE_AFTER_SALES_STATUSES.includes(request.status);
          const refunds = request.refunds.filter(
            (refund) => refund.status === RefundStatuses.Completed,
          );
          const submitted = formatDay(request.requestedAt);
          const reviewed = formatDay(request.reviewedAt);
          const received = formatDay(request.receivedAt);
          const resolved = formatDay(request.resolvedAt);
          return (
            <li
              key={request.id}
              className="rounded-2xl border border-border bg-card p-4"
              data-after-sales-request-status={request.status}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold">
                    {AFTER_SALES_KIND_LABELS[request.kind] ?? request.kind}
                  </h3>
                  <span className={`badge ${statusBadge[request.status] ?? "badge-muted"}`}>
                    {AFTER_SALES_STATUS_LABELS[request.status] ?? request.status}
                  </span>
                </div>
                <span className="text-xs text-muted">
                  {submitted ? `Submitted ${submitted}` : ""}
                </span>
              </div>

              <StepRail request={request} />

              <p className="mt-3 text-sm">{request.reason}</p>
              {request.customerNote && (
                <p className="mt-1 text-xs text-muted">Your note: {request.customerNote}</p>
              )}

              {request.status === AfterSalesStatuses.Rejected && request.adminNote && (
                <p className="mt-3 rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm text-accent">
                  Store decision: {request.adminNote}
                </p>
              )}
              {request.status !== AfterSalesStatuses.Rejected && request.adminNote && (
                <p className="mt-3 rounded-xl border border-border bg-surface p-3 text-sm">
                  <span className="font-semibold">Store note: </span>
                  {request.adminNote}
                </p>
              )}

              {request.items.length > 0 && (
                <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
                  {request.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate font-medium">{item.orderItem.name}</span>
                      <span className="text-xs text-muted">
                        requested {item.requestedQuantity}
                        {item.approvedQuantity !== null && ` · approved ${item.approvedQuantity}`}
                        {item.receivedQuantity !== null && ` · received ${item.receivedQuantity}`}
                        {item.disposition &&
                          ` · ${dispositions[item.disposition] ?? item.disposition}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {refunds.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {refunds.map((refund) => (
                    <li key={refund.id} className="flex flex-wrap justify-between gap-2">
                      <span>{refundTenders[refund.tender] ?? refund.tender}</span>
                      <span className="font-semibold">
                        {formatPrice(refund.amountCents, orderCurrency)}
                        {refund.externalReference && (
                          <span className="ml-2 text-xs font-normal text-muted">
                            ref {refund.externalReference}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {request.kind === AfterSalesKinds.Replacement && request.replacementOrder && (
                <p className="mt-3 text-sm">
                  Replacement order:{" "}
                  <Link
                    href={`/account/orders/${request.replacementOrder.number}`}
                    className="font-semibold text-primary underline"
                  >
                    {request.replacementOrder.number}
                  </Link>
                </p>
              )}
              {request.status === AfterSalesStatuses.Resolved &&
                request.kind === AfterSalesKinds.Return &&
                refunds.length === 0 && (
                  <p className="mt-3 text-sm text-muted">No refund was due for this request.</p>
                )}

              {(reviewed || received || resolved) && (
                <p className="mt-3 border-t border-border pt-2 text-xs text-muted">
                  {[
                    reviewed && `Reviewed ${reviewed}`,
                    received && `Received ${received}`,
                    resolved && `Resolved ${resolved}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {active && (
                <p className="mt-2 text-xs font-medium text-primary">
                  In progress — we will notify you when the store moves to the next step.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
