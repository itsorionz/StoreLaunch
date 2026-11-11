"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSalesRepCommission } from "@backend/actions/admin";
import { useToast } from "@frontend/components/ui/toast";

type CommissionRow = {
  userId: string;
  name: string;
  commissionBps: number;
  orders: number;
  revenueCents: number;
  commissionCents: number;
  sharePercent: number;
};

export function CommissionTable({ rows }: { rows: CommissionRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = (row: CommissionRow) => {
    const percent = Number(draft);
    if (!Number.isFinite(percent) || percent < 0 || percent > 50) {
      const message = "Rate must be between 0% and 50%";
      setError(message);
      toast(message, "error");
      return;
    }
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("userId", row.userId);
      formData.set("commissionBps", String(Math.round(percent * 100)));
      const result = await saveSalesRepCommission(null, formData);
      if (!result.ok) {
        const message = result.error ?? "Could not save the rate";
        setError(message);
        toast(message, "error");
        return;
      }
      toast(`Commission rate for ${row.name} set to ${percent}%`);
      setEditing(null);
      router.refresh();
    });
  };

  if (!rows.length)
    return (
      <section className="card p-6 text-center text-sm text-muted">
        No sales-rep accounts yet. Grant the Sales role to a staff account to start tracking
        commission.
      </section>
    );

  return (
    <section className="card p-5">
      <h2 className="font-bold">Per-rep commission</h2>
      <p className="mt-1 text-sm text-muted">
        Rates apply to future orders. Share is this rep&apos;s slice of total commission earned.
      </p>
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent"
        >
          {error}
        </p>
      )}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-2.5 font-semibold">Sales rep</th>
              <th className="px-3 py-2.5 text-right font-semibold">Rate</th>
              <th className="px-3 py-2.5 text-right font-semibold">Orders</th>
              <th className="px-3 py-2.5 text-right font-semibold">Revenue</th>
              <th className="px-3 py-2.5 text-right font-semibold">Commission</th>
              <th className="px-3 py-2.5 text-right font-semibold">Share</th>
              <th className="px-3 py-2.5 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId} className="border-b border-border/50 last:border-0">
                <td className="px-3 py-2.5 font-medium">{row.name}</td>
                <td className="px-3 py-2.5 text-right font-semibold">
                  {editing === row.userId ? (
                    <span className="inline-flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={50}
                        step={0.25}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        className="input w-20 py-1 text-right text-xs"
                        aria-label={`Commission percent for ${row.name}`}
                        autoFocus
                      />
                      <span className="text-xs text-muted">%</span>
                    </span>
                  ) : (
                    `${row.commissionBps / 100}%`
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">{row.orders}</td>
                <td className="px-3 py-2.5 text-right">
                  ৳{row.revenueCents.toLocaleString("en-BD")}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold">
                  ৳{row.commissionCents.toLocaleString("en-BD")}
                </td>
                <td className="px-3 py-2.5 text-right text-muted">{row.sharePercent}%</td>
                <td className="px-3 py-2.5 text-right">
                  {editing === row.userId ? (
                    <span className="inline-flex gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => save(row)}
                        className="btn btn-sm btn-primary"
                      >
                        {pending ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setEditing(null)}
                        className="btn btn-sm btn-outline"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(row.userId);
                        setDraft(String(row.commissionBps / 100));
                        setError(null);
                      }}
                      className="btn btn-sm btn-outline"
                    >
                      Edit rate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
