import Link from "next/link";
import { requireAdminPage } from "@backend/lib/session";
import { getStoreSettings } from "@backend/lib/settings";
import { getGrowthSignals, getCampaignPerformance } from "@backend/lib/owner-insights";
import { formatPrice } from "@backend/lib/money";
import { PageHeader } from "@frontend/components/admin/admin-ui";

export const metadata = { title: "Growth insights — Admin" };

export default async function AdminInsightsPage() {
  await requireAdminPage();
  const settings = await getStoreSettings();
  const [signals, campaigns] = await Promise.all([
    getGrowthSignals(),
    getCampaignPerformance(settings.currencyCode),
  ]);
  const money = (value: number) => formatPrice(value, settings.currencySymbol);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Growth insights"
        subtitle="Demand the store is losing, customers waiting to buy, and how campaigns perform"
        action={
          <Link href="/admin/promotions/new" className="btn-primary">
            Recover abandoned carts
          </Link>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Growth summary">
        <Stat
          label="Abandoned carts"
          value={String(signals.abandoned.count)}
          detail={`${money(signals.abandoned.valueCents)} of demand left in carts · ${signals.abandoned.buckets.over24h} older than 24h`}
          metric="abandoned-carts"
        />
        <Stat
          label="Waiting for restock"
          value={String(signals.totals.restockWaiting)}
          detail="Unsent back-in-stock requests across the catalog"
          metric="restock-demand"
        />
        <Stat
          label="Wishlist saves"
          value={String(signals.totals.wishlistSaves)}
          detail="All-time saves across every product"
          metric="wishlist-saves"
        />
        <Stat
          label="Referral rewards paid"
          value={money(signals.referrals.rewardCostCents)}
          detail={`${signals.referrals.signups} signups · ${signals.referrals.qualifyingOrders} qualifying orders · ${money(signals.referrals.unitRewardCents)} per reward`}
          metric="referral-cost"
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card overflow-hidden" aria-label="Abandoned carts">
          <div className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold">Abandoned carts</h2>
              <Link
                href="/admin/promotions/new"
                className="text-xs font-semibold text-primary hover:underline"
              >
                Send recovery message →
              </Link>
            </div>
            <p className="mt-1 text-xs text-muted">
              Carts with selected items untouched for 30+ minutes that have not become an order.
              Value uses current prices.
            </p>
            <dl className="mt-3 grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["Untouched ≤ 1h", signals.abandoned.buckets.within1h],
                  ["1–24h", signals.abandoned.buckets.h1to24],
                  ["Older than 24h", signals.abandoned.buckets.over24h],
                ] as const
              ).map(([label, count]) => (
                <div key={label} className="rounded-xl border border-border bg-surface-2 px-3 py-2">
                  <dt className="text-[11px] text-muted">{label}</dt>
                  <dd className="mt-0.5 text-lg font-bold" data-admin-bucket={label}>
                    {count}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          {signals.abandoned.topProducts.length ? (
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr>
                  <th className="px-5 py-3">Product left behind</th>
                  <th className="px-5 py-3 text-right">Units</th>
                  <th className="px-5 py-3 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {signals.abandoned.topProducts.map((product) => (
                  <tr key={product.productId}>
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/products/${product.productId}`}
                        className="font-medium hover:text-primary"
                      >
                        {product.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold">{product.units}</td>
                    <td className="px-5 py-3 text-right">{money(product.valueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted">
              No abandoned carts right now — every started cart became an order.
            </p>
          )}
        </section>

        <section className="card overflow-hidden" aria-label="Campaign performance">
          <div className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold">Campaign performance</h2>
              <Link
                href="/admin/campaigns"
                className="text-xs font-semibold text-primary hover:underline"
              >
                Manage campaigns →
              </Link>
            </div>
            <p className="mt-1 text-xs text-muted">
              Sales of campaign products in the last 30 days ({settings.currencyCode}) · active and
              recently ended campaigns · cancelled orders excluded
            </p>
          </div>
          {campaigns.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-surface-2 text-xs text-muted">
                  <tr>
                    <th className="px-5 py-3">Campaign</th>
                    <th className="px-5 py-3 text-right">Units</th>
                    <th className="px-5 py-3 text-right">Sold value</th>
                    <th className="px-5 py-3 text-right">At offer price</th>
                    <th className="px-5 py-3 text-right">Discount given</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {campaigns.map((campaign) => (
                    <tr key={campaign.id}>
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/campaigns/${campaign.id}`}
                          className="font-medium hover:text-primary"
                        >
                          {campaign.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted">
                          {campaign.placement} · {campaign.productCount} products
                          {campaign.avgDiscountPercent > 0 &&
                            ` · ${Math.round(campaign.avgDiscountPercent)}% off`}
                          {campaign.status === "ended" && (
                            <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted">
                              ENDED
                            </span>
                          )}
                          {campaign.flashSale && (
                            <span className="ml-1.5 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                              FLASH
                            </span>
                          )}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-right font-semibold">{campaign.units}</td>
                      <td className="px-5 py-3 text-right">{money(campaign.valueCents)}</td>
                      <td className="px-5 py-3 text-right">{money(campaign.offerValueCents)}</td>
                      <td className="px-5 py-3 text-right">
                        {campaign.discountGivenCents > 0 ? (
                          <span className="text-accent">{money(campaign.discountGivenCents)}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted">
              No active campaigns yet. Create one to run banners and flash-sale pricing.
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card overflow-hidden" aria-label="Most wishlisted products">
          <div className="p-5">
            <h2 className="font-bold">Most wishlisted products</h2>
            <p className="mt-1 text-xs text-muted">
              All-time saves — a cheap proxy for what customers want next.
            </p>
          </div>
          {signals.wishlist.length ? (
            <ul className="divide-y divide-border">
              {signals.wishlist.map((row) => (
                <li
                  key={row.productId}
                  className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                >
                  <Link
                    href={`/admin/products/${row.productId}`}
                    className="min-w-0 truncate font-medium hover:text-primary"
                  >
                    {row.name}
                  </Link>
                  <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold">
                    {row.saves} saves
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted">No wishlist activity yet.</p>
          )}
        </section>

        <section className="card overflow-hidden" aria-label="Back-in-stock demand">
          <div className="p-5">
            <h2 className="font-bold">Customers waiting for restock</h2>
            <p className="mt-1 text-xs text-muted">
              Unsent back-in-stock requests — restock and notify to convert this demand.
            </p>
          </div>
          {signals.restock.length ? (
            <ul className="divide-y divide-border">
              {signals.restock.map((row) => (
                <li
                  key={row.productId}
                  className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/admin/products/${row.productId}`}
                      className="block truncate font-medium hover:text-primary"
                    >
                      {row.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted">Current stock: {row.stock}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
                    {row.waiting} waiting
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted">
              Nobody is waiting for a restock right now.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  metric,
}: {
  label: string;
  value: string;
  detail: string;
  metric: string;
}) {
  return (
    <div data-admin-metric={metric} className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-3 break-words text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">{detail}</p>
    </div>
  );
}
