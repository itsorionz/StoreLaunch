import Link from "next/link";
import { requireServicePage } from "@backend/lib/session";
import { listSupportOrders } from "@backend/lib/support-queries";
import { getDict } from "@frontend/i18n/dict";
import { formatPrice } from "@backend/lib/money";
import { getStoreSettings } from "@backend/lib/settings";
import { StatusBadge } from "@frontend/components/admin/admin-ui";
import { FilterPills } from "@frontend/components/service/service-ui";
import {
  AfterSalesStatuses,
  OrderStatuses,
  PaymentAttemptStatuses,
  PaymentMethods,
} from "@backend/lib/enums.mjs";
import type { Prisma } from "@backend/generated/prisma/client";

export const metadata = { title: "Orders — Support" };

// Support-focused queues: the questions customers actually ask, not the
// fulfillment work an operations team tracks. Read-only (plan decision D6).
function supportOrderQueues(now = new Date()) {
  return {
    returns: {
      label: "Returns & cancellations",
      where: {
        OR: [
          { status: OrderStatuses.ReturningToOrigin },
          { afterSalesRequests: { some: { status: AfterSalesStatuses.Requested } } },
        ],
      } satisfies Prisma.OrderWhereInput,
    },
    payment: {
      label: "Awaiting online payment",
      where: {
        status: OrderStatuses.Pending,
        paymentMethod: PaymentMethods.GATEWAY,
        paidAt: null,
      } satisfies Prisma.OrderWhereInput,
    },
    "payment-review": {
      label: "Payments in review",
      where: {
        paymentAttempt: { is: { status: PaymentAttemptStatuses.ReviewRequired } },
      } satisfies Prisma.OrderWhereInput,
    },
    overdue: {
      label: "In transit over 48h",
      where: {
        status: OrderStatuses.Shipped,
        shippedAt: { lt: new Date(now.getTime() - 48 * 3600000) },
      } satisfies Prisma.OrderWhereInput,
    },
    cancelled: {
      label: "Cancelled",
      where: { status: OrderStatuses.Cancelled } satisfies Prisma.OrderWhereInput,
    },
  };
}

export default async function SupportOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string; q?: string }>;
}) {
  await requireServicePage();
  const dict = await getDict();
  const [params, settings] = await Promise.all([searchParams, getStoreSettings()]);
  const queues = supportOrderQueues();
  const queue =
    params.queue && Object.prototype.hasOwnProperty.call(queues, params.queue)
      ? queues[params.queue as keyof typeof queues]
      : undefined;
  const q = (params.q ?? "").trim().slice(0, 120);

  const { orders, counts } = await listSupportOrders({ queues, queue, q });

  const linkWith = (patch: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = {
      queue: queue ? params.queue : undefined,
      q: q || undefined,
      ...patch,
    };
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) if (value) search.set(key, value);
    const query = search.toString();
    return `/support/orders${query ? `?${query}` : ""}`;
  };

  return (
    <div className="animate-fade-up space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Order lookup</h1>
          <p className="mt-1 text-sm text-muted">
            Find any order and read its full story — no changes can be made from here.
          </p>
        </div>
        <span className="badge badge-muted">
          {orders.length} shown{queue ? " in queue" : ""}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterPills
          items={[
            {
              href: linkWith({ queue: undefined }),
              label: "All recent",
              active: !queue,
            },
            ...Object.entries(queues).map(([key, entry]) => ({
              href: linkWith({ queue: key }),
              label: entry.label,
              active: params.queue === key,
              count: counts[key],
            })),
          ]}
        />
        <form method="get" action="/support/orders" className="flex gap-2">
          {queue && <input type="hidden" name="queue" value={params.queue} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={120}
            placeholder="Order #, name, phone, address…"
            className="input w-64"
          />
          <button type="submit" className="btn-outline shrink-0">
            {dict.common.search}
          </button>
        </form>
      </div>

      {queue && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
          <p>{queue.label} · showing up to 100 newest matches</p>
          <Link href="/support/orders" className="font-semibold text-primary hover:underline">
            Clear filters
          </Link>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">No orders match this view.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-semibold uppercase tracking-wider text-muted">
                <th className="px-5 py-3.5">Order</th>
                <th className="px-5 py-3.5">Customer</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Payment</th>
                <th className="px-5 py-3.5 text-right">Total</th>
                <th className="px-5 py-3.5 text-right">Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const symbol =
                  order.currencySymbol ||
                  (order.currencyCode ? `${order.currencyCode} ` : settings.currencySymbol);
                return (
                  <tr
                    key={order.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/support/orders/${order.number}`}
                        className="font-semibold transition-colors hover:text-primary"
                      >
                        #{order.number}
                      </Link>
                      <span className="block max-w-52 truncate text-xs text-muted">
                        {order.recipientName} · {order.city}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/support/customers/${order.user.id}`}
                        className="transition-colors hover:text-primary"
                      >
                        {order.user.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted">
                      {order.paymentMethod === PaymentMethods.COD ? "COD" : "Gateway"}
                      {order.paidAt ? " · paid" : ""}
                    </td>
                    <td className="px-5 py-3.5 text-right font-medium">
                      {formatPrice(order.totalCents, symbol)}
                    </td>
                    <td className="px-5 py-3.5 text-right text-xs text-muted">
                      {order.createdAt.toLocaleDateString("en-GB", {
                        timeZone: "Asia/Dhaka",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
