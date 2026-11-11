import Link from "next/link";
import {
  getOpenAfterSalesRequestsCount,
  listAfterSalesRequests,
  listReturningToOriginOrders,
} from "@backend/lib/admin-orders-queries";
import { requireAdminPage } from "@backend/lib/session";

export const metadata = { title: "Returns and cancellations - Admin" };
export default async function AfterSalesQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdminPage();
  const query = await searchParams;
  const total = await getOpenAfterSalesRequestsCount();
  const returnToOriginOrders = await listReturningToOriginOrders();
  const pages = Math.max(1, Math.ceil(total / 50));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(query.page) || 1)));
  const requests = await listAfterSalesRequests(page);
  return (
    <div>
      <h1 className="text-2xl font-bold">Returns, replacements and cancellations</h1>
      <p className="mt-2 text-sm text-muted">
        {total} requests need review, receipt or inspection. Open the original order to process
        them.
      </p>
      <section className="mt-5 rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-bold">Parcels returning to store ({returnToOriginOrders.length})</h2>
        {returnToOriginOrders.length ? (
          <ul className="mt-3 divide-y divide-border">
            {returnToOriginOrders.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <Link
                    className="font-semibold text-primary underline"
                    href={`/admin/orders/${order.number}`}
                  >
                    {order.number}
                  </Link>
                  <p className="text-muted">
                    {order.recipientName} · latest failed attempt:{" "}
                    {order.deliveryAttempts[0]?.reason ?? "—"}
                  </p>
                </div>
                <span className="text-xs text-muted">
                  Dispatched{" "}
                  {order.shippedAt?.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" }) ??
                    "date not recorded"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">No parcels are currently returning.</p>
        )}
      </section>
      <div className="mt-5 overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="p-3">Requested</th>
              <th className="p-3">Order</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Request</th>
              <th className="p-3">Items</th>
              <th className="p-3">Reason</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id} className="border-b border-border">
                <td className="p-3">
                  {request.requestedAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}
                </td>
                <td className="p-3">
                  <Link
                    className="text-primary underline"
                    href={`/admin/orders/${request.order.number}`}
                  >
                    {request.order.number}
                  </Link>
                </td>
                <td className="p-3">{request.user.name}</td>
                <td className="p-3">{request.kind}</td>
                <td className="p-3">
                  {request.items
                    .map((item) => `${item.orderItem.name} × ${item.requestedQuantity}`)
                    .join(", ") || "—"}
                </td>
                <td className="p-3">{request.reason}</td>
                <td className="p-3">{request.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!requests.length && (
          <p className="p-5 text-sm text-muted">No after-sales requests need action.</p>
        )}
      </div>
      <nav className="mt-4 flex gap-4 text-sm">
        <span>
          Page {page} of {pages}
        </span>
        {page > 1 && <Link href={`/admin/returns?page=${page - 1}`}>Previous</Link>}
        {page < pages && <Link href={`/admin/returns?page=${page + 1}`}>Next</Link>}
      </nav>
    </div>
  );
}
