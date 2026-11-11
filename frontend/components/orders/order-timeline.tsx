import { OrderEventTypes, OrderStatuses, PaymentMethods } from "@backend/lib/enums.mjs";
import type { OrderEventView } from "@backend/lib/order-events";
import { formatPrice } from "@backend/lib/money";
import { CUSTOMER_ORDER_EVENTS } from "@backend/lib/order-status";

const descriptions: Record<string, { title: string; body: string }> = {
  [OrderEventTypes.Placed]: {
    title: "Order Placed",
    body: "Your order has been successfully placed.",
  },
  [OrderEventTypes.PaymentConfirmed]: {
    title: "Payment confirmed",
    body: "We have confirmed payment for your order.",
  },
  [OrderEventTypes.Processing]: {
    title: "Processing",
    body: "We have received your order and will check and confirm it shortly.",
  },
  [OrderEventTypes.Confirmed]: { title: "Confirmed", body: "We have confirmed your order." },
  [OrderEventTypes.Packing]: { title: "Packing", body: "We are currently packing your order." },
  [OrderEventTypes.Packed]: { title: "Packed", body: "Your order is packed now." },
  [OrderEventTypes.Shipped]: {
    title: "Delivering",
    body: "Your order has been picked up for delivery.",
  },
  [OrderEventTypes.DeliveryAttempted]: {
    title: "Delivery attempt unsuccessful",
    body: "The courier could not complete delivery. The store will review the next step.",
  },
  [OrderEventTypes.ReturnToOriginStarted]: {
    title: "Returning to store",
    body: "The delivery could not be completed. Your parcel is being returned to the store.",
  },
  [OrderEventTypes.ReturnToOriginReceived]: {
    title: "Returned to store",
    body: "The store received your parcel and is reconciling the order and any eligible refund.",
  },
  [OrderEventTypes.Delivered]: { title: "Delivered", body: "Your order has been delivered." },
  [OrderEventTypes.Cancelled]: { title: "Cancelled", body: "Your order has been cancelled." },
  [OrderEventTypes.ReturnRequested]: {
    title: "After-sales request submitted",
    body: "The store will review your request.",
  },
  [OrderEventTypes.ReturnApproved]: {
    title: "After-sales request approved",
    body: "The store will contact you about the next step.",
  },
  [OrderEventTypes.ReturnRejected]: {
    title: "After-sales request declined",
    body: "Open your order to read the store's review note or contact support.",
  },
  [OrderEventTypes.ReturnReceived]: {
    title: "Return received",
    body: "Returned items are waiting for inspection.",
  },
  [OrderEventTypes.ReturnInspected]: {
    title: "Return inspected",
    body: "The inspection is complete.",
  },
  [OrderEventTypes.ReturnResolved]: {
    title: "After-sales request resolved",
    body: "Open your order to see any refund or replacement details.",
  },
};

const milestones: { type: string; title: string }[] = [
  { type: OrderEventTypes.Placed, title: "Order Placed" },
  { type: OrderEventTypes.Processing, title: "Processing" },
  { type: OrderEventTypes.Confirmed, title: "Confirmed" },
  { type: OrderEventTypes.Packing, title: "Packing" },
  { type: OrderEventTypes.Packed, title: "Packed" },
  { type: OrderEventTypes.Shipped, title: "Delivering" },
  { type: OrderEventTypes.Delivered, title: "Delivered" },
];

const terminalEventTypes: ReadonlySet<string> = new Set([
  OrderEventTypes.Cancelled,
  OrderEventTypes.ReturnToOriginStarted,
]);

const inProgressStatuses: ReadonlySet<string> = new Set([
  OrderStatuses.Pending,
  OrderStatuses.Paid,
  OrderStatuses.Processing,
  OrderStatuses.Confirmed,
  OrderStatuses.Packing,
  OrderStatuses.Packed,
  OrderStatuses.Shipped,
]);

const terminalStatuses: ReadonlySet<string> = new Set([
  OrderStatuses.Cancelled,
  OrderStatuses.ReturningToOrigin,
]);

type TimelineRow = {
  key: string;
  eventType: string;
  date: Date | null;
  title: string;
  body: string | null;
  meta: string | null;
  state: "done" | "upcoming" | "cancelled";
  current: boolean;
  firstUpcoming: boolean;
};

function customerRows({
  visible,
  status,
  paymentMethod,
  number,
  rider,
}: {
  visible: OrderEventView[];
  status?: string;
  paymentMethod?: string;
  number?: string;
  rider?: { name: string; phone: string } | null;
}): TimelineRow[] {
  const milestoneTypes = new Set(milestones.map((milestone) => milestone.type));
  const earliest = new Map<string, OrderEventView>();
  for (const event of visible) if (!earliest.has(event.type)) earliest.set(event.type, event);
  const extras = visible.filter((event) => !milestoneTypes.has(event.type));

  const currentType = status && inProgressStatuses.has(status) ? status : null;
  const terminalReached =
    (status !== undefined && terminalStatuses.has(status)) ||
    extras.some((event) => terminalEventTypes.has(event.type));

  let lastReachedIndex = -1;
  milestones.forEach((milestone, index) => {
    if (earliest.has(milestone.type)) lastReachedIndex = index;
  });
  if (status) {
    const statusIndex = milestones.findIndex((milestone) => milestone.type === status);
    if (statusIndex > lastReachedIndex) lastReachedIndex = statusIndex;
  }

  const dated: { at: number; row: TimelineRow }[] = [];
  for (const milestone of milestones) {
    const event = earliest.get(milestone.type);
    if (!event) continue;
    const suffix =
      milestone.type === OrderEventTypes.Placed && paymentMethod
        ? ` (${paymentMethod === PaymentMethods.COD ? PaymentMethods.COD : "Online payment"})`
        : "";
    const body =
      milestone.type === OrderEventTypes.Placed && number
        ? `Your order # ${number} is successfully placed.`
        : milestone.type === OrderEventTypes.Shipped && rider
          ? `Rider (${rider.name}: ${rider.phone}) has picked up your order for delivery.`
          : (descriptions[milestone.type]?.body ?? null);
    dated.push({
      at: event.createdAt.getTime(),
      row: {
        key: event.id,
        eventType: milestone.type,
        date: event.createdAt,
        title: `${milestone.title}${suffix}`,
        body,
        meta: null,
        state: "done",
        current: currentType !== null && milestone.type === currentType,
        firstUpcoming: false,
      },
    });
  }
  for (const event of extras) {
    const cancelled = event.type === OrderEventTypes.Cancelled;
    dated.push({
      at: event.createdAt.getTime(),
      row: {
        key: event.id,
        eventType: event.type,
        date: event.createdAt,
        title: descriptions[event.type]?.title ?? event.type,
        body: descriptions[event.type]?.body ?? null,
        meta: null,
        state: cancelled ? "cancelled" : "done",
        current: false,
        firstUpcoming: false,
      },
    });
  }
  dated.sort((a, b) => a.at - b.at);

  const upcoming = terminalReached
    ? []
    : milestones.filter(
        (milestone, index) => index > lastReachedIndex && !earliest.has(milestone.type),
      );

  return [
    ...dated.map((entry) => entry.row),
    ...upcoming.map((milestone, index) => ({
      key: `upcoming-${milestone.type}`,
      eventType: milestone.type,
      date: null,
      title: milestone.title,
      body: null,
      meta: null,
      state: "upcoming" as const,
      current: false,
      firstUpcoming: index === 0,
    })),
  ];
}

export function OrderTimeline({
  events,
  internal = false,
  status,
  currencyCode,
  paymentMethod,
  number,
  rider,
}: {
  events: OrderEventView[];
  internal?: boolean;
  status?: string;
  currencyCode: string | null;
  paymentMethod?: string;
  number?: string;
  rider?: { name: string; phone: string } | null;
}) {
  const visible = internal
    ? events
    : events.filter((event) => (CUSTOMER_ORDER_EVENTS as readonly string[]).includes(event.type));
  const rows: TimelineRow[] = internal
    ? visible.map((event) => ({
        key: event.id,
        eventType: event.type ?? "unknown",
        date: event.createdAt,
        title: event.message,
        body: null,
        meta:
          `${event.actorName} · ${event.actorRole}` +
          (event.amountCents !== null
            ? ` · ${formatPrice(event.amountCents, currencyCode ? `${currencyCode} ` : "[currency unrecorded] ")}`
            : ""),
        state: event.type === OrderEventTypes.Cancelled ? "cancelled" : "done",
        current: false,
        firstUpcoming: false,
      }))
    : customerRows({ visible, status, paymentMethod, number, rider });
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface text-sm">
      <h2 className="border-b border-border px-4 py-4 font-bold sm:px-5">
        {internal ? "Order history" : "Timeline"}
      </h2>
      {!rows.length ? (
        <p className="p-5 text-xs text-muted">Detailed history was not recorded for this order.</p>
      ) : (
        <ol className="px-4 py-5 sm:px-5">
          {rows.map((row, index) => {
            const upcoming = row.state === "upcoming";
            const cancelled = row.state === "cancelled";
            const nextState = rows[index + 1]?.state;
            return (
              <li
                key={row.key}
                data-order-event={row.eventType}
                className="grid grid-cols-[82px_18px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[104px_18px_minmax(0,1fr)] sm:gap-x-4"
              >
                <span className="pb-7 text-xs leading-relaxed text-muted">
                  {row.date && (
                    <>
                      <time dateTime={row.date.toISOString()} className="block">
                        <span className="block">
                          {row.date.toLocaleDateString("en-US", {
                            timeZone: "Asia/Dhaka",
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        <span className="block">
                          {row.date.toLocaleTimeString("en-US", {
                            timeZone: "Asia/Dhaka",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </span>
                      </time>
                    </>
                  )}
                </span>
                <span className="relative flex justify-center" aria-hidden>
                  {index < rows.length - 1 && (
                    <span
                      className={`absolute bottom-0 top-6 w-px ${
                        nextState === "upcoming" ? "bg-border" : "bg-primary/60"
                      }`}
                    />
                  )}
                  {upcoming ? (
                    <span className="relative mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-border bg-card" />
                  ) : (
                    <span
                      className={`relative mt-0.5 flex h-4 w-4 items-center justify-center rounded-full text-white ${
                        cancelled ? "bg-accent" : "bg-primary"
                      } ${row.current ? "ring-4 ring-primary/20" : ""}`}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path d={cancelled ? "M3 3l6 6M9 3 3 9" : "m2 6 2.5 2.5L10 3"} />
                      </svg>
                    </span>
                  )}
                </span>
                <div className="min-w-0 pb-7">
                  <p className={upcoming ? "font-medium text-muted" : "font-medium"}>
                    {row.title}
                    {row.current && (
                      <span className="ml-2 inline-block rounded-full bg-primary-light px-2 py-0.5 align-middle text-[10px] font-semibold text-primary-dark">
                        In progress
                      </span>
                    )}
                    {upcoming && (
                      <span className="ml-2 inline-block rounded-full bg-surface-2 px-2 py-0.5 align-middle text-[10px] font-semibold text-muted">
                        {row.firstUpcoming ? "Up next" : "Upcoming"}
                      </span>
                    )}
                  </p>
                  {row.body && (
                    <p
                      className={`mt-1.5 break-words text-xs leading-relaxed text-muted ${
                        row.eventType === OrderEventTypes.Placed ? "font-semibold" : ""
                      }`}
                    >
                      {row.body}
                    </p>
                  )}
                  {row.meta && (
                    <p className="mt-1 text-xs leading-relaxed text-muted">{row.meta}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {rows.length > 0 && (
        <p className="border-t border-border px-4 py-2 text-[11px] text-muted sm:px-5">
          Times shown in Bangladesh time (UTC+06:00).
        </p>
      )}
    </section>
  );
}
