"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createShipment, syncShipmentStatus } from "@backend/actions/admin";
import { useToast } from "@frontend/components/ui/toast";

/** Per-row "Sync now" — forces an immediate carrier status fetch (§5.5). */
export function ShipmentSyncButton({
  shipmentId,
  enabled,
}: {
  shipmentId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!enabled)
    return (
      <span className="text-xs text-muted" title="Manual shipments sync from the carrier portal">
        manual
      </span>
    );

  return (
    <span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const formData = new FormData();
            formData.set("shipmentId", shipmentId);
            const result = await syncShipmentStatus(null, formData);
            if (!result.ok) {
              const message = result.error ?? "Sync failed";
              setError(message);
              toast(message, "error");
              return;
            }
            toast("Shipment status synced with the carrier");
            router.refresh();
          })
        }
        className="btn btn-sm btn-outline"
      >
        {pending ? "Syncing…" : "Sync now"}
      </button>
      {error && (
        <span role="alert" className="mt-1 block text-xs text-accent">
          {error}
        </span>
      )}
    </span>
  );
}

/** Manual shipment creation for orders that skipped the dispatch board. */
export function CreateShipmentForm({
  orders,
  companies,
}: {
  orders: { id: string; label: string }[];
  companies: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!orders.length) return null;

  return (
    <section className="card p-5">
      <h2 className="font-bold">Create shipment manually</h2>
      <p className="mt-1 text-sm text-muted">
        For orders without one. Prefer the dispatch board — it also manages today&apos;s manifests.
      </p>
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent"
        >
          {error}
        </p>
      )}
      <form
        className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          setError(null);
          startTransition(async () => {
            const result = await createShipment(null, formData);
            if (!result.ok) {
              const message = result.error ?? "Could not create the shipment";
              setError(message);
              toast(message, "error");
              return;
            }
            toast("Shipment created");
            router.refresh();
          });
        }}
      >
        <select name="orderId" className="input" required defaultValue="">
          <option value="" disabled>
            Select order
          </option>
          {orders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.label}
            </option>
          ))}
        </select>
        <select name="deliveryCompanyId" className="input" defaultValue="auto">
          <option value="auto">Auto — pick best carrier</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
        <select name="providerMode" className="input" defaultValue="Api">
          <option value="Api">Carrier API</option>
          <option value="Manual">Manual</option>
        </select>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Creating…" : "Create shipment"}
        </button>
      </form>
    </section>
  );
}
