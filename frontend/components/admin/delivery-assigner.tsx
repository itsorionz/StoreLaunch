"use client";

import { OrderStatuses } from "@backend/lib/enums.mjs";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignDelivery } from "@backend/actions/admin";
import { useToast } from "@frontend/components/ui/toast";

export function DeliveryAssigner({
  orderId,
  status,
  riderId,
  companyId,
  riders,
  companies,
}: {
  orderId: string;
  status: string;
  riderId: string | null;
  companyId: string | null;
  riders: { id: string; name: string; phone: string }[];
  companies: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const value = riderId ? `rider:${riderId}` : companyId ? `company:${companyId}` : "";
  const hasOptions = riders.length > 0 || companies.length > 0;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 text-sm">
      <h2 className="mb-2 font-bold">Delivery</h2>
      {!(
        [
          OrderStatuses.Pending,
          OrderStatuses.Paid,
          OrderStatuses.Processing,
          OrderStatuses.Confirmed,
          OrderStatuses.Packing,
          OrderStatuses.Packed,
        ] as readonly string[]
      ).includes(status) && (
        <p className="mb-2 text-xs text-muted">
          Assignment is locked after dispatch or cancellation.
        </p>
      )}
      {!hasOptions ? (
        <p className="text-xs text-muted">
          No partners or companies yet — add them from the Delivery page.
        </p>
      ) : (
        <label className="block">
          <span className="sr-only">Assign delivery</span>
          <select
            value={value}
            disabled={
              pending ||
              !(
                [
                  OrderStatuses.Pending,
                  OrderStatuses.Paid,
                  OrderStatuses.Processing,
                  OrderStatuses.Confirmed,
                  OrderStatuses.Packing,
                  OrderStatuses.Packed,
                ] as readonly string[]
              ).includes(status)
            }
            onChange={(e) => {
              const next = e.target.value;
              startTransition(async () => {
                const res = await assignDelivery(orderId, next);
                if (!res.ok) toast(res.error ?? "Could not update delivery", "error");
                else toast(next ? "Delivery assigned" : "Assignment cleared");
                router.refresh();
              });
            }}
            className="input"
          >
            <option value="">No delivery assigned</option>
            {riders.length > 0 && (
              <optgroup label="Delivery partners">
                {riders.map((r) => (
                  <option key={r.id} value={`rider:${r.id}`}>
                    {r.name} · {r.phone}
                  </option>
                ))}
              </optgroup>
            )}
            {companies.length > 0 && (
              <optgroup label="Delivery companies">
                {companies.map((c) => (
                  <option key={c.id} value={`company:${c.id}`}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
      )}
      {!riderId && !companyId && hasOptions && (
        <p className="mt-2 text-xs text-muted">
          Customers can rate the delivery partner once one is assigned.
        </p>
      )}
    </div>
  );
}
