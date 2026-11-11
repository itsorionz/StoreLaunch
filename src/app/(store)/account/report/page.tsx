import { OrderStatuses } from "@backend/lib/enums.mjs";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@backend/lib/session";
import { getAccountWalletBalance, listAccountOrderSummaries } from "@backend/lib/account-queries";
import { getDict } from "@frontend/i18n/dict";
import { getStoreSettings } from "@backend/lib/settings";
import { formatPrice } from "@backend/lib/money";

export const metadata = { title: "My Report" };

async function ReportContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/account/report");

  const [orders, wallet, dict, settings] = await Promise.all([
    listAccountOrderSummaries(user.id),
    getAccountWalletBalance(user.id),
    getDict(),
    getStoreSettings(),
  ]);

  const paidOrders = orders.filter(
    (order) =>
      order.status !== OrderStatuses.Cancelled &&
      (order.paidAt ||
        order.status === OrderStatuses.Paid ||
        order.status === OrderStatuses.Delivered),
  );
  const spentByCurrency = new Map<string, number>();
  for (const order of paidOrders) {
    const code = order.currencyCode || "Currency unrecorded";
    spentByCurrency.set(code, (spentByCurrency.get(code) ?? 0) + order.totalCents);
  }
  const spent =
    [...spentByCurrency].map(([code, amount]) => formatPrice(amount, `${code} `)).join(", ") ||
    formatPrice(0, settings.currencySymbol);
  const totalItems = orders
    .filter((order) => order.status !== OrderStatuses.Cancelled)
    .reduce((s, o) => s + o.items.reduce((q, i) => q + i.quantity, 0), 0);

  const stats = [
    { label: dict.account.reportOrders, value: String(orders.length) },
    { label: dict.account.reportSpent, value: spent },
    { label: dict.account.reportItems, value: String(totalItems) },
    {
      label: dict.account.reportWallet,
      value: formatPrice(wallet?.balanceCents ?? 0, settings.currencySymbol),
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{dict.account.reportTitle}</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{s.label}</p>
            <p className="mt-1.5 text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="skeleton h-48 w-full rounded-2xl" />}>
      <ReportContent />
    </Suspense>
  );
}
