"use client";

import { useState } from "react";
import { requestStockTransfer, type TransferActionResult } from "@backend/actions/transfers";
import type { RebalancingSuggestion } from "@backend/lib/rebalancing";

export function RebalanceSuggestions({ suggestions }: { suggestions: RebalancingSuggestion[] }) {
  const [requested, setRequested] = useState<Record<string, "done" | "error">>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const request = async (suggestion: RebalancingSuggestion) => {
    const key = `${suggestion.productId}:${suggestion.from.warehouseId}:${suggestion.to.warehouseId}`;
    setBusyId(key);
    const formData = new FormData();
    formData.set("productId", suggestion.productId);
    formData.set("fromWarehouseId", suggestion.from.warehouseId);
    formData.set("toWarehouseId", suggestion.to.warehouseId);
    formData.set("qty", String(suggestion.qty));
    formData.set("notes", `Rebalance suggestion (${suggestion.velocityPerDay}/day at destination)`);
    const result: TransferActionResult = await requestStockTransfer(null, formData);
    setRequested((prev) => ({ ...prev, [key]: result.ok ? "done" : "error" }));
    setBusyId(null);
  };

  return (
    <div className="card p-6">
      <h2 className="font-medium mb-1">Rebalancing suggestions</h2>
      <p className="mb-4 text-sm text-muted">
        Velocity-based transfers from surplus warehouses to locations at risk of stockout.
        Requesting one adds it to the transfer queue as a pending transfer.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            <th className="p-3 text-left">Product</th>
            <th className="p-3 text-left">Move from</th>
            <th className="p-3 text-left">Move to</th>
            <th className="p-3 text-center">Qty</th>
            <th className="p-3 text-right">Dest. velocity</th>
            <th className="p-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {suggestions.map((s) => {
            const key = `${s.productId}:${s.from.warehouseId}:${s.to.warehouseId}`;
            const state = requested[key];
            return (
              <tr key={key} className="border-b border-border">
                <td className="p-3 font-medium">
                  {s.productName}
                  <span className="block font-mono text-xs text-muted">{s.sku ?? s.productId}</span>
                </td>
                <td className="p-3">
                  {s.from.warehouseName}
                  <span className="block text-xs text-muted">+{s.from.excessQty} above target</span>
                </td>
                <td className="p-3">
                  {s.to.warehouseName}
                  <span className="block text-xs text-muted">-{s.to.deficitQty} below target</span>
                </td>
                <td className="p-3 text-center font-bold">{s.qty}</td>
                <td className="p-3 text-right">{s.velocityPerDay}/day</td>
                <td className="p-3 text-right">
                  {state === "done" ? (
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      Requested ✓
                    </span>
                  ) : state === "error" ? (
                    <span className="text-xs font-medium text-accent">
                      Failed — see transfer queue
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === key}
                      onClick={() => void request(s)}
                      className="btn btn-sm btn-primary"
                    >
                      {busyId === key ? "Requesting…" : "Request transfer"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {!suggestions.length && (
            <tr>
              <td colSpan={6} className="p-6 text-center text-muted">
                Stock is balanced across warehouses — no transfers suggested right now.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
