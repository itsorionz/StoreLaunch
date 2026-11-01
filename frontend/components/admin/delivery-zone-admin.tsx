"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveDeliveryZone } from "@backend/actions/admin";

type DeliveryZoneRow = {
  id: string;
  name: string;
  areas: string[];
  mode: string;
  warehouseId: string | null;
  deliveryHubId: string | null;
  rateCents: number;
  codFeeCents: number;
  etaDaysFrom: number;
  etaDaysTo: number;
  active: boolean;
};

type MappingOption = { id: string; label: string };

export function DeliveryZoneAdmin({
  zones,
  warehouses,
  hubs,
}: {
  zones: DeliveryZoneRow[];
  warehouses: MappingOption[];
  hubs: MappingOption[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const filteredZones = zones.filter(
    (z) => (!activeOnly || z.active) && z.name.toLowerCase().includes(search.toLowerCase()),
  );
  const labelFor = (options: MappingOption[], id: string | null) =>
    (id && options.find((option) => option.id === id)?.label) || "—";

  const handleSave = async (formData: FormData) => {
    const result = await saveDeliveryZone(null, formData);
    setSaveError(result.ok ? null : (result.error ?? "Could not save the zone"));
    if (result.ok) router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="mb-4 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search zones..."
          className="input flex-1"
        />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
            className="checkbox"
          />
          Show only active
        </label>
        <a href="/admin/delivery-hubs" className="btn btn-outline">
          Delivery hubs
        </a>
      </div>
      <form action={handleSave} className="card space-y-3 p-4">
        <input name="name" placeholder="Name" className="input" required />
        <input name="areas" placeholder="Areas (comma separated)" className="input" />
        <select name="mode" className="input">
          <option value="OwnRider">Own rider</option>
          <option value="Courier">Courier</option>
        </select>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Warehouse (zone → warehouse mapping)
            <select name="warehouseId" className="input">
              <option value="">No warehouse preference</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Delivery hub (zone → hub pin)
            <select name="deliveryHubId" className="input">
              <option value="">Auto-assign by address</option>
              {hubs.map((hub) => (
                <option key={hub.id} value={hub.id}>
                  {hub.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <input name="rateCents" type="number" placeholder="Rate cents" className="input" />
        <input name="codFeeCents" type="number" placeholder="COD fee cents" className="input" />
        <input name="freeOverCents" type="number" placeholder="Free over cents" className="input" />
        <input name="etaDaysFrom" type="number" placeholder="ETA from" className="input" />
        <input name="etaDaysTo" type="number" placeholder="ETA to" className="input" />
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked className="checkbox" />
          Active
        </label>
        {saveError && <p className="text-sm text-red-600">{saveError}</p>}
        <button className="btn-primary">Save</button>
      </form>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>Name</th>
            <th>Areas</th>
            <th>Mode</th>
            <th>Warehouse</th>
            <th>Hub</th>
            <th>Rate</th>
            <th>COD Fee</th>
            <th>ETA</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          {filteredZones.map((z) => (
            <tr key={z.id}>
              <td>{z.name}</td>
              <td>{z.areas.join(", ")}</td>
              <td>{z.mode}</td>
              <td>{labelFor(warehouses, z.warehouseId)}</td>
              <td>{labelFor(hubs, z.deliveryHubId)}</td>
              <td>{z.rateCents}</td>
              <td>{z.codFeeCents}</td>
              <td>
                {z.etaDaysFrom}-{z.etaDaysTo} d
              </td>
              <td>
                <span className={`badge ${z.active ? "badge-success" : "badge-error"}`}>
                  {z.active ? "On" : "Off"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
