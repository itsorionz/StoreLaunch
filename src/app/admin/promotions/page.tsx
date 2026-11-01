import Link from "next/link";
import { db } from "@backend/lib/db";
import { PromotionStatuses, PromotionAudiences, Roles } from "@backend/lib/enums.mjs";

export const metadata = { title: "Customer promotions - Admin" };

export default async function PromotionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const requestedPage = /^\d{1,6}$/.test(params.page ?? "") ? Math.max(1, Number(params.page)) : 1;
  const [total, drafts, sent, customers] = await Promise.all([
    db.promotion.count(),
    db.promotion.count({ where: { status: PromotionStatuses.Draft } }),
    db.promotion.count({ where: { status: PromotionStatuses.Sent } }),
    db.user.count({ where: { active: true, roles: { has: Roles.Customer } } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / 20));
  const page = Math.min(requestedPage, pages);
  const promotions = await db.promotion.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * 20,
    take: 20,
    include: { _count: { select: { messages: true } } },
  });
  const reads = await db.inboxMessage.groupBy({
    by: ["promotionId"],
    where: { promotionId: { in: promotions.map((p) => p.id) }, readAt: { not: null } },
    _count: true,
  });
  const readCounts = new Map(reads.map((row) => [row.promotionId, row._count]));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Customer promotions</h1>
          <p className="mt-1 text-sm text-muted">
            Send offers to customer inboxes and track reads.
          </p>
        </div>
        <Link href="/admin/promotions/new" className="btn-primary">
          Create promotion
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Active customers", customers],
          [PromotionStatuses.Draft, drafts],
          [PromotionStatuses.Sent, sent],
        ].map(([label, value]) => (
          <div key={label} className="card p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted">
          Create Flash Sale, Deals or a custom offer section in Campaigns. Add products and
          discounts, then link the collection in a promotion.
        </p>
        <Link href="/admin/campaigns" className="btn-outline btn-sm">
          Manage offer sections
        </Link>
      </div>
      <section className="card overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-border bg-surface-2 text-xs text-muted">
            <tr>
              {["Promotion", "Status", "Audience", "Recipients", "Read / Unread", "Action"].map(
                (label) => (
                  <th key={label} className="px-4 py-3">
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {promotions.length ? (
              promotions.map((promotion) => (
                <tr key={promotion.id}>
                  <td className="max-w-72 px-4 py-4">
                    <p className="break-words font-semibold">{promotion.title}</p>
                    <p className="mt-1 text-xs text-muted">
                      {(promotion.sentAt ?? promotion.createdAt).toLocaleString("en-GB", {
                        timeZone: "Asia/Dhaka",
                      })}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${promotion.status === PromotionStatuses.Sent ? "bg-primary-light text-primary" : "bg-surface-2 text-muted"}`}
                    >
                      {promotion.status}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {promotion.audience === PromotionAudiences.AllCustomers
                      ? "All customers"
                      : "Selected customers"}
                  </td>
                  <td className="px-4 py-4">
                    {promotion.status === PromotionStatuses.Sent ? promotion.recipientCount : "—"}
                  </td>
                  <td className="px-4 py-4">
                    {promotion.status === PromotionStatuses.Sent
                      ? `${readCounts.get(promotion.id) ?? 0} / ${promotion._count.messages - (readCounts.get(promotion.id) ?? 0)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-4">
                    <Link href={`/admin/promotions/${promotion.id}`} className="btn-outline btn-sm">
                      {promotion.status === PromotionStatuses.Draft
                        ? "Review & send"
                        : "View results"}
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="p-10 text-center text-muted">
                  No promotions yet. Create a draft to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={`/admin/promotions?page=${page - 1}`} className="btn-outline">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span>
            Page {page} / {pages}
          </span>
          {page < pages ? (
            <Link href={`/admin/promotions?page=${page + 1}`} className="btn-outline">
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
