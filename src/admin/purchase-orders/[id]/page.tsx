import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "@backend/lib/db";

export default function PurchaseOrderDetailPage() {
  const { id } = useParams();
  const [po, setPo] = useState<
    | {
        id: string;
        number: string;
        status: string;
      }
    | undefined
  >(undefined);

  useEffect(() => {
    const loadPo = async () => {
      if (!id) return;
      const p = await db.purchaseOrder.findUnique({ where: { id } });
      if (!p) return;
      setPo({
        id: p.id,
        number: p.number,
        status: p.status,
      });
    };
    loadPo();
  }, [id]);

  return (
    <div className="min-h-screen bg-gray-50">
      <h1 className="text-2xl font-medium p-4">Purchase Order Detail</h1>
      {po ? (
        <div className="p-4">
          <div className="font-medium mb-2">{po.number}</div>
          <div>Status: {po.status}</div>
        </div>
      ) : (
        <p>Loading purchase order...</p>
      )}
    </div>
  );
}
