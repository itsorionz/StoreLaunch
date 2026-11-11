"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createReceipt, type AdminActionResult } from "@backend/actions/admin";
import { ActionResultToast } from "@frontend/components/ui/validated-form";

type PoLine = { productId: string; name: string; sku: string | null; qtyOrdered: number };
type OpenPo = { id: string; number: string; supplierName: string; lines: PoLine[] };

const EMPTY: AdminActionResult | null = null;

export function ReceivingForm({
  pos,
  warehouseId,
  receiverId,
}: {
  pos: OpenPo[];
  warehouseId: string;
  receiverId: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<AdminActionResult | null, FormData>(
    async (_prev, formData) => {
      const po = pos.find((entry) => entry.id === String(formData.get("poId")));
      if (!po) return { ok: false, error: "Select a purchase order" };
      const quantities = po.lines.map((line) => ({
        productId: line.productId,
        qtyAccepted: Math.max(0, Number(formData.get(`accepted-${line.productId}`) ?? 0) || 0),
        qtyRejected: Math.max(0, Number(formData.get(`rejected-${line.productId}`) ?? 0) || 0),
      }));
      if (!quantities.some((line) => line.qtyAccepted > 0 || line.qtyRejected > 0))
        return { ok: false, error: "Enter received quantities for at least one line" };
      formData.set("lines", JSON.stringify(quantities));
      formData.set("warehouseId", warehouseId);
      formData.set("receiverId", receiverId);
      const result = await createReceipt(null, formData);
      if (result.ok) router.refresh();
      return result;
    },
    EMPTY,
  );

  const [poId, setPoId] = useState(pos[0]?.id ?? "");
  const selected = pos.find((po) => po.id === poId);

  if (!pos.length)
    return (
      <p className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
        No open purchase orders to receive against. Purchase orders are managed by administrators.
      </p>
    );

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <ActionResultToast result={state} successMessage="Receipt recorded." />
      <label className="block">
        <span className="text-xs font-semibold text-muted">Purchase order</span>
        <select
          name="poId"
          value={poId}
          onChange={(e) => setPoId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          {pos.map((po) => (
            <option key={po.id} value={po.id}>
              {po.number} — {po.supplierName}
            </option>
          ))}
        </select>
      </label>

      {selected && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 font-semibold">Product</th>
                <th className="py-2 text-right font-semibold">Ordered</th>
                <th className="py-2 text-right font-semibold">Accepted</th>
                <th className="py-2 text-right font-semibold">Rejected</th>
              </tr>
            </thead>
            <tbody>
              {selected.lines.map((line) => (
                <tr key={line.productId} className="border-b border-border/40 last:border-0">
                  <td className="py-2">
                    {line.name}
                    {line.sku ? (
                      <span className="ml-2 font-mono text-xs text-muted">{line.sku}</span>
                    ) : null}
                  </td>
                  <td className="py-2 text-right">{line.qtyOrdered}</td>
                  <td className="py-2 text-right">
                    <input
                      name={`accepted-${line.productId}`}
                      type="number"
                      min={0}
                      defaultValue={0}
                      className="w-20 rounded border border-border bg-background px-2 py-1 text-right text-sm"
                    />
                  </td>
                  <td className="py-2 text-right">
                    <input
                      name={`rejected-${line.productId}`}
                      type="number"
                      min={0}
                      defaultValue={0}
                      className="w-20 rounded border border-border bg-background px-2 py-1 text-right text-sm"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {state?.error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50"
      >
        {pending ? "Recording…" : "Record receipt"}
      </button>
    </form>
  );
}
