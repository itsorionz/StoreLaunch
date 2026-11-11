"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createStocktakeAdjustment, type AdminActionResult } from "@backend/actions/admin";
import { searchStocktakeProduct, type StocktakeProductHit } from "@backend/actions/warehouse";
import { ActionResultToast } from "@frontend/components/ui/validated-form";

const EMPTY: AdminActionResult | null = null;

export function StocktakeForm({ warehouseIds }: { warehouseIds: string[] }) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(warehouseIds[0] ?? "");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<StocktakeProductHit[]>([]);
  const [selected, setSelected] = useState<StocktakeProductHit | null>(null);
  const [counted, setCounted] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, formAction, pending] = useActionState<AdminActionResult | null, FormData>(
    async (_prev, formData) => {
      const result = await createStocktakeAdjustment(null, formData);
      if (result.ok) {
        setSelected(null);
        setQuery("");
        setCounted("");
        router.refresh();
      }
      return result;
    },
    EMPTY,
  );

  useEffect(() => {
    if (!query.trim() || !warehouseId) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setHits(await searchStocktakeProduct(warehouseId, query));
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, warehouseId]);

  const shownHits = query.trim() && warehouseId ? hits : [];

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <ActionResultToast result={state} successMessage="Stock adjusted." />
      {warehouseIds.length > 1 && (
        <label className="block">
          <span className="text-xs font-semibold text-muted">Warehouse</span>
          <select
            value={warehouseId}
            onChange={(e) => {
              setWarehouseId(e.target.value);
              setSelected(null);
              setHits([]);
            }}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {warehouseIds.map((id) => (
              <option key={id} value={id}>
                Warehouse
              </option>
            ))}
          </select>
        </label>
      )}
      <input type="hidden" name="warehouseId" value={warehouseId} />

      {selected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
          <input type="hidden" name="productId" value={selected.id} />
          <div>
            <p className="text-sm font-semibold">{selected.name}</p>
            <p className="text-xs text-muted">
              {selected.sku ?? selected.barcode ?? "no code"} · system count {selected.qty}
              {selected.binCode ? ` · bin ${selected.binCode}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              name="countedQty"
              type="number"
              min={0}
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              placeholder="Counted"
              className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm"
              autoFocus
            />
            <button
              type="submit"
              disabled={pending || counted === ""}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Adjust"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setQuery("");
                setCounted("");
              }}
              className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-surface-2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search product by name, SKU, or barcode"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {shownHits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  onClick={() => setSelected(hit)}
                  className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-surface-2"
                >
                  <span className="min-w-0 truncate font-semibold">{hit.name}</span>
                  <span className="ml-3 shrink-0 text-xs text-muted">counted {hit.qty}</span>
                </button>
              </li>
            ))}
            {!shownHits.length && query.trim() && (
              <li className="px-1 py-2 text-sm text-muted">
                No stock rows match in this warehouse.
              </li>
            )}
          </ul>
        </>
      )}

      {state?.error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          Stock adjusted.
        </p>
      )}
    </form>
  );
}
