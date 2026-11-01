import { requireWarehousePage } from "@backend/lib/session";
import { db } from "@backend/lib/db";
import { ReceivingForm } from "@frontend/components/warehouse/receiving-form";

export const metadata = { title: "Receiving" };

export default async function WarehouseReceivingPage() {
  const user = await requireWarehousePage();

  const warehouses = await db.warehouse.findMany({
    where: { active: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isDefault: true },
  });
  const warehouse = warehouses[0];

  const [openPos, receipts] = await Promise.all([
    warehouse
      ? db.purchaseOrder.findMany({
          where: { status: { in: ["Draft", "Sent", "Partial"] } },
          include: {
            supplier: { select: { name: true } },
            lines: {
              include: { product: { select: { name: true, sku: true } } },
              select: {
                productId: true,
                qtyOrdered: true,
                qtyReceived: true,
                product: { select: { name: true, sku: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
          take: 20,
        })
      : Promise.resolve([]),
    db.receipt.findMany({
      orderBy: { receivedAt: "desc" },
      take: 20,
      include: {
        warehouse: { select: { name: true } },
        lines: { select: { qtyAccepted: true, qtyRejected: true } },
      },
    }),
  ]);

  const pos = openPos.map((po) => ({
    id: po.id,
    number: po.number,
    supplierName: po.supplier.name,
    lines: po.lines.map((line) => ({
      productId: line.productId,
      name: line.product.name,
      sku: line.product.sku,
      qtyOrdered: Math.max(0, line.qtyOrdered - line.qtyReceived),
    })),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Receiving</h1>
        <p className="text-sm text-muted">
          {warehouse
            ? `Goods in against purchase orders · ${warehouse.name}`
            : "No active warehouse configured"}
        </p>
      </div>

      {warehouse ? (
        <ReceivingForm pos={pos} warehouseId={warehouse.id} receiverId={user.id} />
      ) : (
        <p className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
          An administrator must create an active warehouse before receiving stock.
        </p>
      )}

      <div className="rounded-xl border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 text-sm font-bold">Recent receipts</h2>
        {receipts.length ? (
          <ul className="divide-y divide-border/40">
            {receipts.map((receipt) => {
              const accepted = receipt.lines.reduce((sum, line) => sum + line.qtyAccepted, 0);
              const rejected = receipt.lines.reduce((sum, line) => sum + line.qtyRejected, 0);
              return (
                <li
                  key={receipt.id}
                  className="flex items-center justify-between px-4 py-2.5 text-sm"
                >
                  <span>
                    {receipt.warehouse.name}
                    <span className="ml-2 text-xs text-muted">
                      {receipt.receivedAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}
                    </span>
                  </span>
                  <span className="text-xs font-semibold">
                    <span className="text-emerald-600 dark:text-emerald-400">+{accepted}</span>
                    {rejected > 0 && (
                      <span className="ml-2 text-red-500">−{rejected} rejected</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted">No receipts recorded yet.</p>
        )}
      </div>
    </div>
  );
}
