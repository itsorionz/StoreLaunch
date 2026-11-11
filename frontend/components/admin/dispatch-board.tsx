"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createShipment, handoverManifest, openDailyManifests } from "@backend/actions/admin";
import { useConfirm } from "@frontend/components/ui/confirm-dialog";
import { useToast } from "@frontend/components/ui/toast";

type ManifestCard = {
  id: string;
  number: string;
  carrierName: string;
  status: "Open" | "HandedOver";
  lines: number;
  handedOverAt: string | null;
};

type ReadyOrder = {
  id: string;
  number: string;
  recipientName: string;
  zoneName: string | null;
  zoneOwnRider: boolean;
  currentCarrier: string | null;
  totalLabel: string;
};

type CarrierOption = { id: string; name: string };

export function DispatchBoard({
  dayKey,
  manifests,
  readyOrders,
  companies,
}: {
  dayKey: string;
  manifests: ManifestCard[];
  readyOrders: ReadyOrder[];
  companies: CarrierOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [openPending, startOpen] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [carrierChoice, setCarrierChoice] = useState<Record<string, string>>({});
  const [modeChoice, setModeChoice] = useState<Record<string, string>>({});

  const openManifests = () =>
    startOpen(async () => {
      setError(null);
      const result = await openDailyManifests();
      if (!result.ok) {
        const message = result.error ?? "Could not open manifests";
        setError(message);
        toast(message, "error");
        return;
      }
      toast(
        result.created
          ? `Opened ${result.created} manifest${result.created === 1 ? "" : "s"} for ${dayKey}`
          : `Today's manifests already open for ${dayKey}`,
      );
      router.refresh();
    });

  const handover = (manifest: ManifestCard) =>
    startTransition(async () => {
      if (
        !(await confirm({
          title: `Hand over ${manifest.number}?`,
          description: `${manifest.lines} parcel${manifest.lines === 1 ? "" : "s"} to ${manifest.carrierName}. The manifest closes and orders move to Shipped. This cannot be undone.`,
          confirmLabel: "Hand over",
          cancelLabel: "Cancel",
        }))
      )
        return;
      setError(null);
      const result = await handoverManifest(manifest.id);
      if (!result.ok) {
        const message = result.error ?? "Handover failed";
        setError(message);
        toast(message, "error");
        return;
      }
      toast(`Handed over ${result.orderNumber} — parcels are with the carrier`);
      router.refresh();
    });

  const dispatch = (order: ReadyOrder) =>
    startTransition(async () => {
      setError(null);
      const formData = new FormData();
      formData.set("orderId", order.id);
      formData.set("deliveryCompanyId", carrierChoice[order.id] ?? "auto");
      formData.set("providerMode", modeChoice[order.id] ?? "Api");
      formData.set("status", "Pending");
      const result = await createShipment(null, formData);
      if (!result.ok) {
        const message = result.error ?? "Could not create the shipment";
        setError(message);
        toast(message, "error");
        return;
      }
      toast(`${order.number} dispatched`);
      router.refresh();
    });

  const openManifestsList = manifests.filter((manifest) => manifest.status === "Open");
  const handedOverList = manifests.filter((manifest) => manifest.status === "HandedOver");

  return (
    <>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent"
        >
          {error}
        </p>
      )}

      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">Today&apos;s courier manifests</h2>
            <p className="mt-1 text-sm text-muted">
              One open manifest per active courier per Bangladesh day. Creating a shipment attaches
              the order automatically; handover closes the sheet.
            </p>
          </div>
          <button
            type="button"
            disabled={openPending}
            onClick={openManifests}
            className="btn btn-outline"
          >
            {openPending ? "Opening…" : "Open today's manifests"}
          </button>
        </div>

        {manifests.length === 0 ? (
          <p className="rounded-lg bg-surface-2 px-4 py-6 text-center text-sm text-muted">
            No manifests yet for {dayKey}. They open automatically when a shipment is created, or
            with the button above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-3 py-2.5 font-semibold">Manifest</th>
                  <th className="px-3 py-2.5 font-semibold">Courier</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Parcels</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {manifests.map((manifest) => (
                  <tr key={manifest.id} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold">
                      {manifest.number}
                    </td>
                    <td className="px-3 py-2.5">{manifest.carrierName}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">{manifest.lines}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          manifest.status === "Open"
                            ? "bg-primary/15 text-primary"
                            : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {manifest.status === "Open" ? "Open" : "Handed over"}
                      </span>
                      {manifest.handedOverAt && (
                        <span className="ml-2 text-xs text-muted">
                          {new Date(manifest.handedOverAt).toLocaleString("en-GB", {
                            timeZone: "Asia/Dhaka",
                          })}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {manifest.status === "Open" ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => handover(manifest)}
                          className="btn btn-sm btn-primary"
                        >
                          Hand over
                        </button>
                      ) : (
                        <span className="text-xs text-muted">
                          {openManifestsList.some(
                            (open) => open.carrierName === manifest.carrierName,
                          )
                            ? "replaced by a new open manifest"
                            : "closed"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {handedOverList.length > 0 && openManifestsList.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            Handed-over sheets stay listed above for today&apos;s audit trail.
          </p>
        )}
      </section>

      <section className="card p-5">
        <div className="mb-4">
          <h2 className="font-bold">Ready to ship</h2>
          <p className="mt-1 text-sm text-muted">
            Packed orders without a shipment. &quot;Auto&quot; ranks carriers by zone pin, ETA and
            live quote, then creates the shipment and attaches it to today&apos;s manifest.
          </p>
        </div>

        {readyOrders.length === 0 ? (
          <p className="rounded-lg bg-surface-2 px-4 py-6 text-center text-sm text-muted">
            Nothing is waiting for dispatch. Pack an order first.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-3 py-2.5 font-semibold">Order</th>
                  <th className="px-3 py-2.5 font-semibold">Customer</th>
                  <th className="px-3 py-2.5 font-semibold">Zone</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                  <th className="px-3 py-2.5 font-semibold">Carrier</th>
                  <th className="px-3 py-2.5 font-semibold">Mode</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {readyOrders.map((order) => (
                  <tr key={order.id} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold">{order.number}</td>
                    <td className="px-3 py-2.5">{order.recipientName}</td>
                    <td className="px-3 py-2.5">
                      {order.zoneName ?? "—"}
                      {order.zoneOwnRider && (
                        <span className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted">
                          own rider
                        </span>
                      )}
                      {order.currentCarrier && (
                        <span className="block text-xs text-muted">{order.currentCarrier}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold">{order.totalLabel}</td>
                    <td className="px-3 py-2.5">
                      <select
                        className="input py-1.5 text-xs"
                        value={carrierChoice[order.id] ?? "auto"}
                        onChange={(event) =>
                          setCarrierChoice((prev) => ({ ...prev, [order.id]: event.target.value }))
                        }
                        aria-label={`Carrier for ${order.number}`}
                      >
                        <option value="auto">Auto — pick best carrier</option>
                        {companies.map((company) => (
                          <option key={company.id} value={company.id}>
                            {company.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        className="input py-1.5 text-xs"
                        value={modeChoice[order.id] ?? "Api"}
                        onChange={(event) =>
                          setModeChoice((prev) => ({ ...prev, [order.id]: event.target.value }))
                        }
                        aria-label={`Provider mode for ${order.number}`}
                      >
                        <option value="Api">Carrier API</option>
                        <option value="Manual">Manual</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => dispatch(order)}
                        className="btn btn-sm btn-primary"
                      >
                        Dispatch
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
