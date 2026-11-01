import { db } from "@backend/lib/db";

export default async function PickQueuePage() {
  const pickLists = await db.pickList.findMany({
    where: { status: "Picking" },
    include: {
      order: { select: { id: true, number: true } },
      lines: { include: { orderItem: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Pick Queue</h1>
        <p className="text-muted mb-6">Orders ready for picking</p>

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
                  <span className="rounded-full bg-primary/15 px-2 py-1 text-xs font-medium text-primary">
                    Picking
                  </span>
                </div>
                <a href={`/admin/pick/${pl.id}`} className="btn btn-sm btn-outline">
                  Start Picking
                </a>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted">No pick lists to process.</p>
          </div>
        )}
      </div>
    </div>
  );
}
