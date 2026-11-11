import Link from "next/link";
import Image from "next/image";
import { EntityStatuses } from "@backend/lib/enums.mjs";
import { listCampaigns } from "@backend/lib/admin-promotion-queries";
import { DeleteCampaignButton } from "@frontend/components/admin/delete-buttons";
import { AddCampaignModal, EditCampaignModal } from "@frontend/components/admin/entity-modals";
import { PageHeader } from "@frontend/components/admin/admin-ui";

export const metadata = { title: "Campaigns — Admin" };

export default async function AdminCampaignsPage() {
  const campaigns = await listCampaigns();

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Campaigns"
        subtitle={`${campaigns.length} campaigns — manage product offers, discounts and occasion sales`}
        action={<AddCampaignModal />}
      />
      <section className="card mb-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Campaign banners</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted">
              The homepage carousel is managed under Marketing → Carousel. Campaign banners show as
              a fallback on the homepage only when the carousel has no active slides. Product
              offers, Flash Sale and homepage sections are unaffected.
            </p>
          </div>
          <span className="badge-muted">
            {campaigns.filter((campaign) => campaign.active).length} active banners
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {campaigns
            .filter((campaign) => campaign.active)
            .map((campaign) => (
              <div
                key={campaign.id}
                className="overflow-hidden rounded-xl border border-border bg-surface"
              >
                <div className="relative aspect-[16/5] bg-surface-2">
                  <Image
                    src={campaign.imageUrl}
                    alt={campaign.title}
                    fill
                    unoptimized
                    sizes="(max-width: 1280px) 100vw, 33vw"
                    className="object-cover"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <p className="truncate text-sm font-semibold">{campaign.title}</p>
                  <span className="shrink-0 text-xs text-muted">Order {campaign.order}</span>
                </div>
              </div>
            ))}
          {!campaigns.some((campaign) => campaign.active) && (
            <p className="text-sm text-muted">
              No active campaigns. Campaign banners are only needed as a homepage carousel fallback.
            </p>
          )}
        </div>
      </section>
      <section className="card overflow-hidden">
        <ul className="divide-y divide-border">
          {campaigns.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-muted">
              No campaigns yet. Add a campaign, then choose its products and discounts.
            </li>
          )}
          {campaigns.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{c.title}</p>
                <p className="truncate text-xs text-muted">
                  {c._count.products} products {c.flashSale ? " / Flash Sale" : ""}
                  {c.showOnHome ? " / Homepage section" : ""}
                  {c.showInCart ? " / Cart featured" : ""} ·{" "}
                  {c.active ? (
                    <span className="text-primary">{EntityStatuses.Active}</span>
                  ) : (
                    <span className="text-muted">{EntityStatuses.Inactive}</span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Link href={`/admin/campaigns/${c.id}`} className="btn-outline btn-sm">
                  Manage products
                </Link>
                <EditCampaignModal campaign={c} />
                <DeleteCampaignButton id={c.id} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
