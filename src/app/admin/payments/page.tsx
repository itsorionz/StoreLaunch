import Link from "next/link";
import {
  getPaymentRecoveryAttemptsCount,
  listPaymentRecoveryAttempts,
} from "@backend/lib/admin-orders-queries";
import { requireAdminPage } from "@backend/lib/session";
import { formatPrice, orderCurrencyLabel } from "@backend/lib/money";

export const metadata = { title: "Payment recovery - Admin" };
export default async function PaymentRecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdminPage();
  const query = await searchParams;
  const total = await getPaymentRecoveryAttemptsCount();
  const pages = Math.max(1, Math.ceil(total / 50));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(query.page) || 1)));
  const attempts = await listPaymentRecoveryAttempts(page);
  return (
    <div>
      <h1 className="text-2xl font-bold">Payment recovery</h1>
      <p className="mt-2 text-sm text-muted">
        {total} payments awaiting payment or review, including late payments on cancelled orders.
        Open an order to check the provider outcome. Overdue uncertain payments keep their
        reservation until reconciliation.
      </p>
      <div className="mt-5 overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="p-3">Order</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Gateway amount</th>
              <th className="p-3">Payment status</th>
              <th className="p-3">Reservation deadline</th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((attempt) => (
              <tr key={attempt.id} className="border-b border-border">
                <td className="p-3">
                  <Link
                    className="font-semibold text-primary"
                    href={`/admin/orders/${attempt.order.number}`}
                  >
                    {attempt.order.number}
                  </Link>
                </td>
                <td className="p-3">{attempt.order.recipientName}</td>
                <td className="p-3">
                  {formatPrice(
                    attempt.order.totalCents - attempt.order.walletPaidCents,
                    orderCurrencyLabel(attempt.order),
                  )}
                </td>
                <td className="p-3">{attempt.status}</td>
                <td className="p-3">
                  {attempt.expiresAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!attempts.length && (
          <p className="p-5 text-sm text-muted">No unpaid online payments need recovery.</p>
        )}
      </div>
      <nav aria-label="Payment recovery pages" className="mt-4 flex gap-4 text-sm">
        <span>
          Page {page} of {pages}
        </span>
        {page > 1 && <Link href={`/admin/payments?page=${page - 1}`}>Previous</Link>}
        {page < pages && <Link href={`/admin/payments?page=${page + 1}`}>Next</Link>}
      </nav>
    </div>
  );
}
