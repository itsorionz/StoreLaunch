import { OrderStatuses, ReviewStatuses, Roles } from "@backend/lib/enums.mjs";
import { requireAdminPage } from "@backend/lib/session";
import { getCurrentUser } from "@backend/lib/session";
import Link from "next/link";
import { getStoreSettings } from "@backend/lib/settings";
import { getAdminDashboard } from "@backend/lib/admin-dashboard";
import { dashboardChange } from "@backend/lib/admin-dashboard-periods";
import { getWarehouseCards, getDeliveryScorecard } from "@backend/lib/ops-intelligence";
import { getProfitSnapshot, getMoneyPosition, getLicenseStatus } from "@backend/lib/owner-insights";
import { getDefaultWarehouseId } from "@backend/lib/warehouse-queries";
import { formatPrice, orderCurrencyLabel } from "@backend/lib/money";
import { StatusBadge } from "@frontend/components/admin/admin-ui";
import { DashboardChart } from "@frontend/components/admin/dashboard-chart";
import { RefreshAdminDashboard } from "@frontend/components/admin/refresh-dashboard";

export const metadata = { title: "Overview — Admin" };

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireAdminPage();
  const settings = await getStoreSettings();
  const params = await searchParams;
  const warehouseId = await getDefaultWarehouseId();
  const user = await getCurrentUser();
  const isSuperAdmin = user?.role === Roles.SuperAdmin;
  const [data, warehouseCards, deliveryScore, profit, moneyPos, license] = await Promise.all([
    getAdminDashboard(settings.currencyCode, params.range),
    warehouseId ? getWarehouseCards(warehouseId) : null,
    getDeliveryScorecard(),
    getProfitSnapshot(settings.currencyCode, params.range),
    getMoneyPosition(settings.currencyCode),
    getLicenseStatus(),
  ]);
  const money = (value: number) => formatPrice(value, settings.currencySymbol);
  const date = (value: Date) =>
    value.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short" });
  const attention =
    data.queues
      .filter((q) => ["unassigned", "overdue", "cod-review"].includes(q.key))
      .reduce((sum, q) => sum + q.count, 0) +
    data.outOfStock +
    data.reviewCount;
  const statusCount = (status: string) =>
    data.statuses.find((group) => group.status === status)?._count ?? 0;

  return (
    <div className="animate-fade-up space-y-6" data-admin-dashboard>
      {!isSuperAdmin && license?.state !== "active" && (
        <div
          data-admin-license-banner
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/10 px-5 py-4"
        >
          <div className="min-w-0">
            <p className="text-sm font-bold text-accent">
              {license.state === "missing" && "No license activated"}
              {license.state === "revoked" && "License revoked"}
              {license.state === "expired" && "License expired"}
              {license.state === "expiring" &&
                `License expires in ${license.daysToExpiry} day${license.daysToExpiry === 1 ? "" : "s"}`}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {license.state === "missing" &&
                "This instance has no active license. The storefront locks until a license is activated."}
              {license.state === "revoked" &&
                "The activated license has been revoked. The storefront is locked until a valid license is activated."}
              {license.state === "expired" &&
                `The license expired on ${license.expiresAt?.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}. Renew it before the storefront locks.`}
              {license.state === "expiring" &&
                `Renew before ${license.expiresAt?.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })} to keep the storefront running without interruption.`}
            </p>
          </div>
          <Link href="/admin/settings" className="btn-primary shrink-0">
            Instance &amp; license
          </Link>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {settings.storeName} / Operations
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Store overview</h1>
          <p className="mt-2 text-sm text-muted">
            Sales performance, delivery workload and the next things to act on.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshAdminDashboard />
          <Link href="/admin/products/new" className="btn-primary">
            + Add product
          </Link>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
        <nav aria-label="Dashboard period" className="flex gap-1 rounded-lg bg-surface-2 p-1">
          {[7, 30, 90].map((days) => (
            <Link
              key={days}
              href={`/admin?range=${days}`}
              aria-current={data.period.days === days ? "page" : undefined}
              className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors ${data.period.days === days ? "bg-surface text-primary shadow-sm" : "text-muted hover:text-foreground"}`}
            >
              Last {days} days
            </Link>
          ))}
        </nav>
        <p className="text-xs text-muted">
          {date(data.period.start)} – {date(data.period.end)} · Bangladesh time ·{" "}
          {settings.currencyCode}
        </p>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Period performance">
        <Metric
          label="Paid order value"
          value={money(data.paidValue)}
          hint={dashboardChange(data.paidValue, data.previousPaidValue)}
          detail={`${data.paidCount} paid orders · average ${money(data.averagePaidValue)}`}
          primary
          metric="paid-value"
        />
        <Metric
          label="Orders placed"
          value={String(data.orders)}
          hint={dashboardChange(data.orders, data.previousOrders)}
          detail="All order currencies and statuses"
          metric="orders"
        />
        <Metric
          label="Deliveries completed"
          value={String(data.delivered)}
          hint="By delivery date"
          detail="Delivered during the selected period"
          metric="delivered"
        />
        <Metric
          label="New customers"
          value={String(data.customers)}
          hint={dashboardChange(data.customers, data.previousCustomers)}
          detail="Customer accounts created in this period"
          metric="customers"
        />
      </section>
      <section className="card p-5 sm:p-6" aria-label="Profit and money">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">Profit &amp; money</h2>
          <SectionTitleInline href="/admin/margin" link="Profitability report" />
        </div>
        <p className="mt-1 text-xs text-muted">
          What the business actually earned and the cash it holds or owes · {settings.currencyCode}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Gross profit"
            value={money(profit.grossProfitCents)}
            hint={`${profit.marginPercent.toFixed(1)}% margin · ${profit.deliveredOrders} delivered orders`}
            detail={`Revenue ${money(profit.revenueCents)} − product cost ${money(profit.costCents)} · delivered in period`}
            metric="gross-profit"
          />
          <Metric
            label="Wallet liability"
            value={money(moneyPos.walletLiabilityCents)}
            hint={`${moneyPos.walletAccounts} customer wallet${moneyPos.walletAccounts === 1 ? "" : "s"}`}
            detail="Store credit held by customers — owed back on demand"
            metric="wallet-liability"
          />
          <Metric
            label="COD held by couriers"
            value={money(moneyPos.codHeldStoreCurrencyCents)}
            hint={`${moneyPos.codHeldCollections} collections awaiting receipt`}
            detail={
              moneyPos.codHeldByCurrency.length > 1
                ? `Per currency: ${moneyPos.codHeldByCurrency
                    .map((row) => formatPrice(row.amountCents, `${row.currencyCode} `))
                    .join(" · ")}`
                : "Collected cash not yet remitted to the store"
            }
            metric="cod-held"
          />
          <Metric
            label="Refunds paid (30 days)"
            value={money(moneyPos.refunds.totalCents)}
            hint={`${moneyPos.refunds.count} completed refund${moneyPos.refunds.count === 1 ? "" : "s"}`}
            detail={`Wallet ${money(moneyPos.refunds.walletCents)} · Gateway ${money(moneyPos.refunds.gatewayCents)} · Cash ${money(moneyPos.refunds.cashCents)}${
              moneyPos.refunds.awaitingExternal > 0
                ? ` · ${moneyPos.refunds.awaitingExternal} awaiting external`
                : ""
            }${
              moneyPos.refunds.otherCurrencies.count > 0
                ? ` · ${moneyPos.refunds.otherCurrencies.count} in other currencies excluded (${moneyPos.refunds.otherCurrencies.byCurrency
                    .map((row) => formatPrice(row.amountCents, `${row.currencyCode} `))
                    .join(" · ")})`
                : ""
            }`}
            metric="refunds-30d"
          />
        </div>
        {profit.categories.length > 0 && (
          <p className="mt-4 text-xs text-muted">
            Most profitable category this period:{" "}
            <strong className="text-foreground">
              {profit.categories[0].name} ({money(profit.categories[0].profitCents)})
            </strong>{" "}
            · Categories without product cost data count cost as zero.
          </p>
        )}
      </section>
      <section className="overflow-hidden rounded-2xl border border-primary/20 bg-primary/5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/15 px-5 py-4">
          <div>
            <h2 className="font-bold">Needs attention</h2>
            <p className="mt-1 text-xs text-muted">
              Current workload across all dates. A record can appear in more than one queue.
            </p>
          </div>
          <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-primary">
            {attention === 0 ? "No urgent flags" : `${attention} flags`}
          </span>
        </div>
        <div className="grid gap-px bg-border/50 sm:grid-cols-2 xl:grid-cols-4">
          <Attention
            href="/admin/orders?queue=unassigned"
            label="Assign a courier"
            count={data.queues.find((q) => q.key === "unassigned")?.count ?? 0}
            detail="Ready orders without a delivery partner"
          />
          <Attention
            href="/admin/orders?queue=overdue"
            label="Check delayed deliveries"
            count={data.queues.find((q) => q.key === "overdue")?.count ?? 0}
            detail="In transit for more than 48 hours"
          />
          <Attention
            href="/admin/products?stock=out"
            label="Restock unavailable products"
            count={data.outOfStock}
            detail="Active products with zero stock"
          />
          <Attention
            href={`/admin/reviews?status=${ReviewStatuses.Pending}`}
            label="Moderate customer reviews"
            count={data.reviewCount}
            detail="Reviews waiting for approval"
          />
        </div>
      </section>
      <section className="card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold">Warehouse &amp; delivery</h2>
          <span className="text-xs text-muted">Stock, receiving, and delivery operations</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Stock value"
            value={money(warehouseCards?.stockValueCents ?? 0)}
            hint="Inventory value at cost"
            detail={`${warehouseCards?.deadStockQty ?? 0} units dead stock · ${money(warehouseCards?.shrinkageCents ?? 0)} shrinkage (90d)`}
            metric="warehouse-stock-value"
          />
          <Metric
            label="Low stock"
            value={String(warehouseCards?.lowStockCount ?? 0)}
            hint="Below reorder point"
            detail="Products at or below reorder level"
            metric="warehouse-low-stock"
          />
          <Metric
            label="First-attempt delivery"
            value={`${Math.round(deliveryScore.firstAttemptDeliveryPercent)}%`}
            hint="Share delivered first time"
            detail={
              deliveryScore.onTimeHandoverPercent
                ? `${Math.round(deliveryScore.onTimeHandoverPercent)}% on-time handover`
                : "No deliveries yet"
            }
            metric="delivery-first-attempt"
          />
          <Metric
            label="Avg order→delivery"
            value={
              deliveryScore.avgOrderToDeliveryDays
                ? deliveryScore.avgOrderToDeliveryDays.toFixed(1) + " days"
                : "—"
            }
            hint="Order to delivered"
            detail={`${Math.round(deliveryScore.rtoPercent || 0)}% RTO rate${
              deliveryScore.costPerParcel
                ? ` · ${money(deliveryScore.costPerParcel)}/parcel`
                : " · no carrier quotes yet"
            }`}
            metric="delivery-eta"
          />
        </div>
      </section>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <DashboardChart days={data.days} currencySymbol={settings.currencySymbol} />
        <section className="card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold">Order breakdown</h2>
            <span className="text-xs text-muted">Selected period</span>
          </div>
          <p className="mt-1 text-xs text-muted">Current status of orders placed in this period</p>
          <div className="mt-6 space-y-4">
            {(
              [
                [OrderStatuses.Pending, "Pending", "bg-amber-500"],
                [OrderStatuses.Paid, "Paid", "bg-primary"],
                [OrderStatuses.Processing, "Processing", "bg-indigo-500"],
                [OrderStatuses.Confirmed, "Confirmed", "bg-blue-500"],
                [OrderStatuses.Packing, "Packing", "bg-orange-500"],
                [OrderStatuses.Packed, "Packed", "bg-teal-500"],
                [OrderStatuses.Shipped, "Delivering", "bg-sky-500"],
                [OrderStatuses.Delivered, "Delivered", "bg-emerald-500"],
                [OrderStatuses.Cancelled, "Cancelled", "bg-accent"],
              ] as const
            ).map(([status, label, color]) => (
              <Link
                key={status}
                href={`/admin/orders?status=${status}&range=${data.period.days}`}
                className="block rounded-lg outline-offset-4"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${color}`} />
                    {label}
                  </span>
                  <span className="font-bold">{statusCount(status)}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full rounded-full ${color}`}
                    style={{
                      width: `${data.orders ? (statusCount(status) / data.orders) * 100 : 0}%`,
                    }}
                  />
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-sm">
            <span className="text-muted">Cancellation share</span>
            <strong>
              {data.orders
                ? Math.round((statusCount(OrderStatuses.Cancelled) / data.orders) * 100)
                : 0}
              %
            </strong>
          </div>
        </section>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card p-5 sm:p-6">
          <SectionTitle title="Delivery operations" href="/admin/riders" link="Manage partners" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            {data.queues
              .filter((q) =>
                ["dispatch", "preparing", "unassigned", "payment", "overdue"].includes(q.key),
              )
              .map((q) => (
                <Link
                  key={q.key}
                  href={`/admin/orders?queue=${q.key}`}
                  className="rounded-xl border border-border p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <p className="text-2xl font-bold" data-admin-queue={q.key}>
                    {q.count}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{q.label}</p>
                </Link>
              ))}
          </div>
          <p className="mt-4 text-xs text-muted">
            {data.riderCount} active delivery partners · Pending online payments are excluded from
            dispatch-ready orders.
          </p>
        </section>
        <section className="card p-5 sm:p-6">
          <SectionTitle
            title="Cash & reconciliation"
            href="/admin/reconciliation"
            link="Settle COD cash"
          />
          <div className="mt-5 rounded-xl bg-surface-2 p-4">
            <p className="text-xs text-muted">COD still to collect · {settings.currencyCode}</p>
            <p className="mt-1 text-2xl font-bold" data-admin-metric="expected-cod">
              {money(data.expectedCod)}
            </p>
            <p className="mt-1 text-xs text-muted">Open COD orders, after wallet payments</p>
          </div>
          <h3 className="mt-4 text-sm font-semibold">Collected COD awaiting store receipt</h3>
          {data.unremitted.length ? (
            <ul className="mt-2 divide-y divide-border">
              {data.unremitted.map((group) => (
                <li
                  key={group.currencyCode}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span className="text-muted">
                    {group._count} collections · {group.currencyCode}
                  </span>
                  <strong>
                    {formatPrice(group._sum.amountCents ?? 0, `${group.currencyCode} `)}
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">No collections awaiting store receipt.</p>
          )}
          <Link
            href="/admin/orders?queue=cod-review"
            className="mt-4 block rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-xs font-medium text-accent"
          >
            {data.queues.find((q) => q.key === "cod-review")?.count ?? 0} delivered COD orders need
            collection evidence →
          </Link>
        </section>
      </div>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="card min-w-0 overflow-hidden">
          <div className="p-5">
            <SectionTitle title="Recent orders" href="/admin/orders" link="All orders" />
            <p className="mt-1 text-xs text-muted">Latest orders across all dates</p>
          </div>
          {data.recentOrders.length ? (
            <ul className="divide-y divide-border">
              {data.recentOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/admin/orders/${order.number}`}
                    className="flex flex-wrap items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{order.number}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {order.user.name} · {date(order.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={order.status} />
                    <span className="text-sm font-bold">
                      {formatPrice(order.totalCents, orderCurrencyLabel(order))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No orders yet. New orders will appear here.</Empty>
          )}
        </section>
        <section className="card overflow-hidden">
          <div className="p-5">
            <SectionTitle
              title="Stock watch"
              href="/admin/products?stock=low"
              link="View inventory"
            />
            <p className="mt-1 text-xs text-muted">
              {data.lowStockCount} active products at 5 units or fewer
            </p>
          </div>
          {data.lowStock.length ? (
            <ul className="divide-y divide-border">
              {data.lowStock.map((product) => (
                <li key={product.id}>
                  <Link
                    href={`/admin/products/${product.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2"
                  >
                    <span className="line-clamp-2 text-sm font-medium">{product.name}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${product.stock === 0 ? "bg-accent/10 text-accent" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}
                    >
                      {product.stock === 0 ? "Out of stock" : `${product.stock} left`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No low-stock alerts.</Empty>
          )}
        </section>
      </div>
      <section className="card overflow-hidden">
        <div className="p-5">
          <SectionTitle title="Top-selling products" href="/admin/products" link="Manage catalog" />
          <p className="mt-1 text-xs text-muted">
            Units ordered during this period · cancelled orders excluded · {settings.currencyCode}
          </p>
        </div>
        {data.topProducts.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr>
                  <th className="px-5 py-3">Product</th>
                  <th className="px-5 py-3 text-right">Units</th>
                  <th className="px-5 py-3 text-right">Item value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.topProducts.map((product, index) => (
                  <tr key={product.productId}>
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/products/${product.productId}`}
                        className="font-medium hover:text-primary"
                      >
                        <span className="mr-3 text-xs text-muted">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        {product.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold">{product.units}</td>
                    <td className="px-5 py-3 text-right">{money(product.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No product orders in this period.</Empty>
        )}
      </section>
      <div className="space-y-2 rounded-xl border border-border bg-surface-2/50 p-4 text-xs leading-relaxed text-muted">
        <p>
          Paid order value uses payment confirmation dates and excludes cancelled orders. It
          includes wallet tender and confirmed COD, and is not profit or cash received by the store.
          Gross profit counts items of orders delivered in the period at their product cost; orders
          whose products have no cost recorded count cost as zero. Comparisons use the previous
          equal-length time interval.
        </p>
        <p>
          Performance amounts and product values use {settings.currencyCode} only. Cash awaiting
          receipt is shown separately per currency. Item value excludes delivery charges.
        </p>
        {(data.legacyCurrency > 0 || data.otherPaidCurrencies > 0) && (
          <p className="font-medium text-accent">
            {data.otherPaidCurrencies} paid orders in other currencies are excluded from this
            period’s paid value.{" "}
            <Link href="/admin/orders?queue=currency" className="underline">
              {data.legacyCurrency} orders have unrecorded currency.
            </Link>
          </p>
        )}
        <p>
          Updated {data.period.end.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })} · Use
          Refresh to load the latest activity.
        </p>
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  hint,
  detail,
  primary,
  metric,
}: {
  label: string;
  value: string;
  hint: string;
  detail: string;
  primary?: boolean;
  metric: string;
}) {
  return (
    <div
      data-admin-metric={metric}
      className={`relative overflow-hidden rounded-2xl border p-5 ${primary ? "border-primary bg-primary text-white" : "border-border bg-surface"}`}
    >
      <p className={`text-xs font-semibold ${primary ? "text-white/80" : "text-muted"}`}>{label}</p>
      <p className="mt-3 break-words text-3xl font-bold tracking-tight">{value}</p>
      <p className={`mt-3 text-xs font-semibold ${primary ? "text-white/90" : "text-primary"}`}>
        {hint}
      </p>
      <p className={`mt-2 text-[11px] leading-relaxed ${primary ? "text-white/70" : "text-muted"}`}>
        {detail}
      </p>
    </div>
  );
}
function Attention({
  href,
  label,
  count,
  detail,
}: {
  href: string;
  label: string;
  count: number;
  detail: string;
}) {
  return (
    <Link href={href} className="bg-surface p-5 transition-colors hover:bg-primary-light">
      <p className={`text-2xl font-bold ${count ? "text-accent" : "text-primary"}`}>{count}</p>
      <p className="mt-1 text-sm font-semibold">
        {label} <span aria-hidden>↗</span>
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{detail}</p>
    </Link>
  );
}
function SectionTitle({ title, href, link }: { title: string; href: string; link: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-bold">{title}</h2>
      <Link href={href} className="text-xs font-semibold text-primary hover:underline">
        {link} →
      </Link>
    </div>
  );
}
function SectionTitleInline({ href, link }: { href: string; link: string }) {
  return (
    <Link href={href} className="text-xs font-semibold text-primary hover:underline">
      {link} →
    </Link>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-muted">{children}</p>;
}
