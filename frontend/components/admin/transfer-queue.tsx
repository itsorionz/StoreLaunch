"use client";

import { useState } from "react";
import {
  cancelStockTransfer,
  dispatchStockTransfer,
  receiveStockTransfer,
  type TransferActionResult,
} from "@backend/actions/transfers";

export type TransferRow = {
  id: string;
  productName: string;
  sku: string | null;
  fromName: string;
  toName: string;
  qty: number;
  status: "Pending" | "InTransit" | "Received" | "Cancelled";
  note: string | null;
  requestedByName: string | null;
  dispatchedByName: string | null;
  receivedByName: string | null;
  requestedAt: string;
  dispatchedAt: string | null;
  receivedAt: string | null;
};

const STATUS_STYLES: Record<TransferRow["status"], string> = {
  Pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  InTransit: "bg-primary/15 text-primary",
  Received: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  Cancelled: "bg-surface-2 text-muted",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function TransferQueue({ transfers }: { transfers: TransferRow[] }) {
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = async (
    id: string,
    action: (
      prev: TransferActionResult | null,
      formData: FormData,
    ) => Promise<TransferActionResult>,
  ) => {
    setBusyId(id);
    setError(null);
    const formData = new FormData();
    formData.set("id", id);
    const result = await action(null, formData);
    if (!result.ok) setError(result.error ?? "Could not update the transfer");
    setBusyId(null);
    if (result.ok) window.location.reload();
  };

  return (
    <div className="card p-6">
      <h2 className="mb-4 font-medium">Transfer queue</h2>
      {error && <p className="mb-3 text-sm text-accent">{error}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            <th className="p-3 text-left">Product</th>
            <th className="p-3 text-left">Route</th>
            <th className="p-3 text-center">Qty</th>
            <th className="p-3 text-left">Status</th>
            <th className="p-3 text-left">Requested</th>
            <th className="p-3 text-left">Dispatched</th>
            <th className="p-3 text-left">Received</th>
            <th className="p-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((t) => (
            <tr key={t.id} className="border-b border-border">
              <td className="p-3">
                {t.productName}
                <span className="block text-xs text-muted">{t.sku ?? t.id}</span>
              </td>
              <td className="p-3">
                {t.fromName} → {t.toName}
              </td>
              <td className="p-3 text-center">{t.qty}</td>
              <td className="p-3">
                <span
                  className={`rounded px-2 py-1 text-xs font-medium ${STATUS_STYLES[t.status]}`}
                >
                  {t.status}
                </span>
                {t.note && <span className="block text-xs text-muted">{t.note}</span>}
              </td>
              <td className="p-3 text-xs">
                {formatDate(t.requestedAt)}
                <span className="block text-muted">{t.requestedByName ?? "—"}</span>
              </td>
              <td className="p-3 text-xs">
                {formatDate(t.dispatchedAt)}
                {t.dispatchedByName && (
                  <span className="block text-muted">{t.dispatchedByName}</span>
                )}
              </td>
              <td className="p-3 text-xs">
                {formatDate(t.receivedAt)}
                {t.receivedByName && <span className="block text-muted">{t.receivedByName}</span>}
              </td>
              <td className="p-3 text-right">
                <div className="flex justify-end gap-2">
                  {t.status === "Pending" && (
                    <>
                      <button
                        type="button"
                        disabled={busyId === t.id}
                        onClick={() => void run(t.id, dispatchStockTransfer)}
                        className="btn btn-sm btn-primary"
                      >
                        Dispatch
                      </button>
                      <button
                        type="button"
                        disabled={busyId === t.id}
                        onClick={() => void run(t.id, cancelStockTransfer)}
                        className="btn btn-sm btn-outline"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  {t.status === "InTransit" && (
                    <>
                      <button
                        type="button"
                        disabled={busyId === t.id}
                        onClick={() => void run(t.id, receiveStockTransfer)}
                        className="btn btn-sm btn-primary"
                      >
                        Receive
                      </button>
                      <button
                        type="button"
                        disabled={busyId === t.id}
                        onClick={() => void run(t.id, cancelStockTransfer)}
                        className="btn btn-sm btn-outline"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {!transfers.length && (
            <tr>
              <td colSpan={8} className="p-6 text-center text-muted">
                No transfers yet. Request one above to move stock between warehouses.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
