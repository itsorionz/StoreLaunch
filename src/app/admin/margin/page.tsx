import Link from "next/link";
import { requireAdminPage } from "@backend/lib/session";
import { getMarginKpis } from "@backend/lib/ops-intelligence";
import { getStoreSettings } from "@backend/lib/settings";
import { formatPrice } from "@backend/lib/money";
import { PageHeader } from "@frontend/components/admin/admin-ui";

export const metadata = { title: "Profitability — Admin" };

const WINDOW_DAYS = 90;

export default async function MarginPage() {
  await requireAdminPage();
  const settings = await getStoreSettings();
  const money = (value: number) => formatPrice(value, settings.currencySymbol);
  const kpis = await getMarginKpis(settings.currencyCode);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Profitability"
        subtitle={`Gross profit, category mix and SKU margins · delivered orders · last ${WINDOW_DAYS} days · ${settings.currencyCode}`}
      />

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Margin KPIs">
        <div className="rounded-2xl border border-primary bg-primary p-5 text-white">
          <p className="text-xs font-semibold text-white/80">Gross profit</p>
          <p className="mt-3 break-words text-3xl font-bold tracking-tight">
            {money(kpis.grossProfitCents)}
          </p>
          <p className="mt-3 text-xs font-semibold text-white/90">
            {kpis.marginPercent.toFixed(1)}% margin
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs font-semibold text-muted">Revenue (item value)</p>
          <p className="mt-3 break-words text-3xl font-bold tracking-tight">
            {money(kpis.totalRevenueCents)}
          </p>
          <p className="mt-3 text-xs text-muted">Excludes delivery charges</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs font-semibold text-muted">Product cost</p>
          <p className="mt-3 break-words text-3xl font-bold tracking-tight">
            {money(kpis.totalRevenueCents - kpis.grossProfitCents)}
          </p>
          <p className="mt-3 text-xs text-muted">Products without a recorded cost count as zero</p>
        </div>
      </section>

      <section className="card overflow-hidden" aria-label="Category margins">
        <div className="p-5">
          <h2 className="font-bold">Category margins</h2>
          <p className="mt-1 text-xs text-muted">Most profitable categories first</p>
        </div>
        {kpis.categoryMargins.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3 text-right">Revenue</th>
                  <th className="px-5 py-3 text-right">Cost</th>
                  <th className="px-5 py-3 text-right">Profit</th>
                  <th className="px-5 py-3 text-right">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {kpis.categoryMargins.map((row) => (
                  <tr key={row.categoryId}>
                    <td className="px-5 py-3 font-medium">{row.categoryName}</td>
                    <td className="px-5 py-3 text-right">{money(row.revenue)}</td>
                    <td className="px-5 py-3 text-right">{money(row.cost)}</td>
                    <td className="px-5 py-3 text-right font-semibold">{money(row.profit)}</td>
                    <td className="px-5 py-3 text-right">{row.marginPercent.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-muted">
            No delivered orders in this window yet.{" "}
            <Link href="/admin/orders" className="text-primary underline">
              View orders
            </Link>
            .
          </p>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <SkuTable title="Best margin SKUs" skus={kpis.topMarginSkus} money={money} />
        <SkuTable title="Worst margin SKUs" skus={kpis.worstMarginSkus} money={money} />
      </div>

      <p className="text-xs leading-relaxed text-muted">
        Margins count items of orders delivered in the last {WINDOW_DAYS} days in{" "}
        {settings.currencyCode} at the current product cost (cost is read live, so cost edits
        restate historical margins). Revenue is item value only — delivery charges and shipping fees
        are excluded.
      </p>
    </div>
  );
}

function SkuTable({
  title,
  skus,
  money,
}: {
  title: string;
  skus: { sku: string; name: string; revenue: number; profit: number; marginPercent: number }[];
  money: (value: number) => string;
}) {
  return (
    <section className="card overflow-hidden" aria-label={title}>
      <div className="p-5">
        <h2 className="font-bold">{title}</h2>
        <p className="mt-1 text-xs text-muted">Top 10 by revenue in the window</p>
      </div>
      {skus.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] text-left text-sm">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3 text-right">Revenue</th>
                <th className="px-5 py-3 text-right">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {skus.map((row) => (
                <tr key={row.sku}>
                  <td className="px-5 py-3">
                    <span className="block truncate font-medium">{row.name}</span>
                    <span className="text-xs text-muted">{row.sku}</span>
                  </td>
                  <td className="px-5 py-3 text-right">{money(row.revenue)}</td>
                  <td
                    className={`px-5 py-3 text-right font-semibold ${
                      row.marginPercent < 15 ? "text-accent" : "text-foreground"
                    }`}
                  >
                    {row.marginPercent.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-10 text-center text-sm text-muted">No SKU sales in this window.</p>
      )}
    </section>
  );
}
