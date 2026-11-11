import Link from "next/link";
import { notFound } from "next/navigation";
import {
  countActiveCustomers,
  countPromotionEligibleCustomers,
  countPromotionReads,
  getPromotion,
  getPromotionSelectedUsers,
  listPromotionCampaigns,
} from "@backend/lib/admin-promotion-queries";
import { PromotionStatuses, PromotionAudiences } from "@backend/lib/enums.mjs";
import { PromotionForm, SendPromotionButton } from "@frontend/components/admin/promotion-form";

export const metadata = { title: "Review promotion - Admin" };
export default async function PromotionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const promotion = await getPromotion(id);
  if (!promotion) notFound();
  const [campaigns, selectedCustomers, activeCustomerCount, eligibleCount, readCount] =
    await Promise.all([
      listPromotionCampaigns(),
      getPromotionSelectedUsers(promotion.selectedUserIds),
      countActiveCustomers(),
      countPromotionEligibleCustomers(promotion.audience, promotion.selectedUserIds),
      countPromotionReads(id),
    ]);
  const sent = promotion.status === PromotionStatuses.Sent;
  return (
    <div className="space-y-6">
      <Link href="/admin/promotions" className="text-sm text-primary">
        Back to promotions
      </Link>
      <div>
        <h1 className="break-words text-2xl font-bold">{promotion.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {promotion.status} /{" "}
          {promotion.audience === PromotionAudiences.AllCustomers
            ? "All customers"
            : "Selected customers"}
        </p>
      </div>
      {sent ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Recipients", promotion.recipientCount],
            ["Read", readCount],
            ["Unread", promotion._count.messages - readCount],
          ].map(([label, value]) => (
            <div className="card p-4" key={label}>
              <p className="text-xs text-muted">{label}</p>
              <p className="mt-1 text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>
      ) : (
        <PromotionForm
          draft={promotion}
          campaigns={campaigns}
          selectedCustomers={selectedCustomers}
          activeCustomerCount={activeCustomerCount}
        />
      )}
      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">
          {sent ? "Sent message" : "Review saved version before sending"}
        </h2>
        <article className="space-y-2 rounded-xl border border-border p-4">
          <h3 className="break-words font-bold">{promotion.title}</h3>
          <p className="whitespace-pre-line break-words text-sm leading-6 text-muted">
            {promotion.body}
          </p>
          {promotion.href && (
            <Link
              href={promotion.href}
              className="inline-block break-all text-sm text-primary underline"
            >
              {promotion.campaign?.title ?? promotion.href}
            </Link>
          )}
        </article>
        {sent ? (
          <p className="text-sm text-muted">
            Sent by {promotion.sentByName} on{" "}
            {promotion.sentAt?.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}. Sent messages
            cannot be edited. Read counts reflect current customer inboxes.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">
              {eligibleCount} eligible customers. Save any edits above before sending. Only this
              saved version will be delivered.
            </p>
            {promotion.campaign && !promotion.campaign.active && (
              <p className="text-sm text-accent">
                The linked campaign is inactive. Activate it in Campaigns before sending.
              </p>
            )}
            <SendPromotionButton id={id} recipientCount={eligibleCount} />
          </>
        )}
      </section>
      {sent && (
        <Link href="/admin/promotions/new" className="btn-outline">
          Create another promotion
        </Link>
      )}
    </div>
  );
}
