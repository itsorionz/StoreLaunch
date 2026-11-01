import Link from "next/link";
import { db } from "@backend/lib/db";
import { Roles } from "@backend/lib/enums.mjs";
import { PromotionForm } from "@frontend/components/admin/promotion-form";

export const metadata = { title: "Create promotion - Admin" };
export default async function NewPromotionPage() {
  const [campaigns, activeCustomerCount] = await Promise.all([
    db.campaign.findMany({
      orderBy: [{ order: "asc" }, { title: "asc" }],
      select: { id: true, title: true, active: true },
    }),
    db.user.count({ where: { active: true, roles: { has: Roles.Customer } } }),
  ]);
  return (
    <div className="space-y-5">
      <Link href="/admin/promotions" className="text-sm text-primary">
        Back to promotions
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Create customer promotion</h1>
        <p className="mt-1 text-sm text-muted">
          Write your message, choose customers and save a draft before sending.
        </p>
      </div>
      <PromotionForm campaigns={campaigns} activeCustomerCount={activeCustomerCount} />
    </div>
  );
}
