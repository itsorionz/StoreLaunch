import { unstable_noStore } from "next/cache";
import { listPackQueuePickLists } from "@backend/lib/admin-orders-queries";

export default async function PackQueuePage() {
  unstable_noStore();
  const pickLists = await listPackQueuePickLists();

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Pack Station</h1>
        <p className="text-muted mb-6">Orders ready for packing</p>

        {pickLists.length > 0 ? (
          <div className="space-y-4">
            {pickLists.map((pl) => (
              <div key={pl.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-medium">{pl.order.number}</h3>
                    <p className="text-sm text-muted">
                      {pl.lines.length} line(s) &bull; {pl.lines.filter((l) => l.confirmed).length}{" "}
                      confirmed
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                    Picked
                  </span>
                </div>
                <a href={`/admin/pack/${pl.id}`} className="btn btn-outline">
                  Open Pack Station
                </a>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted">No orders ready for packing.</p>
          </div>
        )}
      </div>
    </div>
  );
}
