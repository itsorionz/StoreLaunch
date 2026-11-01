import { connection } from "next/server";
import { suggestRebalancingTransfers } from "@backend/lib/rebalancing";
import { RebalanceSuggestions } from "@frontend/components/admin/rebalance-suggestions";

export const metadata = { title: "Stock rebalancing" };

export default async function RebalancePage() {
  // Suggestions compute against "now" (velocity window); only resolve per request.
  await connection();
  const suggestions = await suggestRebalancingTransfers();

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Stock rebalancing</h1>
            <p className="text-sm text-muted">
              Move slow stock to high-demand warehouses before ordering more
            </p>
          </div>
          <div className="flex gap-2">
            <a href="/admin/warehouse/transfer" className="btn btn-outline">
              Transfer queue
            </a>
            <a href="/admin/warehouse" className="btn btn-outline">
              Back to Warehouses
            </a>
          </div>
        </div>
        <RebalanceSuggestions suggestions={suggestions} />
      </div>
    </div>
  );
}
