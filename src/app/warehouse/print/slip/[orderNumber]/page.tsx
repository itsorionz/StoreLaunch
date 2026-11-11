import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWarehousePage } from "@backend/lib/session";
import { getPackingSlipOrder } from "@backend/lib/warehouse-queries";
import { PrintButton } from "@frontend/components/sales/print-button";

export const metadata = { title: "Packing slip" };

export default async function PackingSlipPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  await requireWarehousePage();
  const { orderNumber } = await params;

  const order = await getPackingSlipOrder(orderNumber);
  if (!order) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/warehouse/print" className="text-sm font-semibold text-accent hover:underline">
          ← Print queue
        </Link>
        <PrintButton label="Print packing slip" />
      </div>

      <div className="rounded-xl border border-border bg-surface p-8">
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <h1 className="text-lg font-black tracking-tight">Packing slip</h1>
            <p className="text-xs text-muted">
              {order.warehouse ? `${order.warehouse.name} (${order.warehouse.code})` : "Store"}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-mono font-bold">{order.number}</p>
            <p className="text-muted">
              {order.createdAt.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}
            </p>
          </div>
        </div>

        <div className="border-b border-border py-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Ship to</p>
          <p className="mt-1 font-semibold">{order.recipientName}</p>
          <p className="font-mono text-xs">{order.phone}</p>
          <p>
            {order.line1} {order.line2 ?? ""}
          </p>
          <p>
            {order.city} {order.region ?? ""} {order.postal ?? ""}
          </p>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 font-semibold">SKU</th>
              <th className="py-2 font-semibold">Item</th>
              <th className="py-2 text-right font-semibold">Qty</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-border/40 last:border-0">
                <td className="py-2 font-mono text-xs">
                  {item.product.sku ?? item.product.barcode ?? "—"}
                </td>
                <td className="py-2">{item.name}</td>
                <td className="py-2 text-right font-bold">{item.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-6 text-center text-xs text-muted">
          Verify all items before sealing the parcel.
        </p>
      </div>
    </div>
  );
}
