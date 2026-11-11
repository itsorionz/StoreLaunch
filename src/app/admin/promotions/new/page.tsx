import Link from "next/link";
import { countActiveCustomers, listPromotionCampaigns } from "@backend/lib/admin-promotion-queries";
import { PromotionForm } from "@frontend/components/admin/promotion-form";

export const metadata = { title: "Create promotion - Admin" };
export default async function NewPromotionPage() {
  const [campaigns, activeCustomerCount] = await Promise.all([
    listPromotionCampaigns(),
    countActiveCustomers(),
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
