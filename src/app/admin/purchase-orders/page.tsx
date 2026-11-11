import { listPurchaseOrders } from "@backend/lib/admin-catalog-queries";

export default async function PurchaseOrdersPage() {
  const pos = await listPurchaseOrders();

  return (
    <div className="min-h-screen bg-background">
      <h1 className="text-2xl font-medium p-4">Purchase Orders</h1>
      <div className="p-4">
        <p>Purchase Orders: {pos.length}</p>
        <ul>
          {pos.map((po) => (
            <li key={po.id}>
              {po.number}: {po.status} - {po.supplier.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
