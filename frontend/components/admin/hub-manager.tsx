"use client";

import { useState } from "react";
import { saveDeliveryHub, toggleDeliveryHub } from "@backend/actions/delivery-hubs";

type HubRow = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  region: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  capacity: number | null;
  assignedToday: number;
  isDefault: boolean;
  active: boolean;
};

type WarehouseOption = { id: string; name: string; code: string };

const EMPTY_FORM = {
  name: "",
  code: "",
  address: "",
  city: "",
  region: "",
  warehouseId: "",
  capacity: "",
  active: true,
  isDefault: false,
};

export function HubManager({
  hubs,
  warehouses,
}: {
  hubs: HubRow[];
  warehouses: WarehouseOption[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const startEdit = (hub: HubRow) => {
    setForm({
      name: hub.name,
      code: hub.code,
      address: hub.address ?? "",
      city: hub.city ?? "",
      region: hub.region ?? "",
      warehouseId: hub.warehouseId ?? "",
      capacity: hub.capacity === null ? "" : String(hub.capacity),
      active: hub.active,
      isDefault: hub.isDefault,
    });
    setEditId(hub.id);
    setShowForm(false);
    setError(null);
  };

  const reset = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setShowForm(false);
    setError(null);
  };

  const handleSubmit = async (formData: FormData) => {
    if (editId) formData.set("id", editId);
    const result = await saveDeliveryHub(null, formData);
    if (result.ok) window.location.reload();
    else setError(result.error ?? "Could not save the delivery hub");
  };

  const handleToggle = async (id: string, active: boolean) => {
    const formData = new FormData();
    formData.set("id", id);
    formData.set("active", String(active));
    const result = await toggleDeliveryHub(null, formData);
    if (result.ok) window.location.reload();
  };

  const editing = editId !== null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Delivery hubs</h1>
          <p className="text-muted">
            Pickup points assigned to orders via zone → warehouse → hub routing
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/admin/delivery-zones" className="btn btn-outline">
            Delivery zones
          </a>
          <button
            type="button"
            onClick={() => {
              reset();
              setShowForm(true);
            }}
            className="btn btn-primary"
          >
            + Add hub
          </button>
        </div>
      </div>

      {(showForm || editing) && (
        <div className="card mb-6 p-4">
          <h3 className="mb-3 font-medium">{editing ? "Edit hub" : "Add hub"}</h3>
          <form action={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <label className="flex flex-col gap-2 text-sm font-medium">
                Name
                <input
                  name="name"
                  type="text"
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Code
                <input
                  name="code"
                  type="text"
                  className="input"
                  placeholder="DHK-DHN"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  required
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Capacity (parcels/day)
                <input
                  name="capacity"
                  type="number"
                  min="1"
                  className="input"
                  placeholder="Unlimited"
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Warehouse
                <select
                  name="warehouseId"
                  className="input"
                  value={form.warehouseId}
                  onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
                >
                  <option value="">No warehouse</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                City
                <input
                  name="city"
                  type="text"
                  className="input"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Region
                <input
                  name="region"
                  type="text"
                  className="input"
                  value={form.region}
                  onChange={(e) => setForm({ ...form, region: e.target.value })}
                />
              </label>
              <label className="col-span-full flex flex-col gap-2 text-sm font-medium">
                Address
                <input
                  name="address"
                  type="text"
                  className="input"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                name="isDefault"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                className="checkbox"
              />
              <label className="text-sm">Default hub</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                name="active"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="checkbox"
              />
              <label className="text-sm">Active</label>
            </div>
            {error && <p className="text-sm text-accent">{error}</p>}
            <div className="flex gap-2">
              <button className="btn btn-primary" type="submit">
                {editing ? "Update hub" : "Create hub"}
              </button>
              <button type="button" onClick={reset} className="btn btn-ghost">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            <th className="p-3 text-left">Name</th>
            <th className="p-3 text-left">Code</th>
            <th className="p-3 text-left">City</th>
            <th className="p-3 text-left">Warehouse</th>
            <th className="p-3 text-center">Today / Capacity</th>
            <th className="p-3 text-center">Default</th>
            <th className="p-3 text-center">Status</th>
            <th className="p-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {hubs.map((hub) => (
            <tr key={hub.id} className="border-b border-border">
              <td className="p-3">
                {hub.name}
                <span className="block text-xs text-muted">{hub.address ?? "—"}</span>
              </td>
              <td className="p-3 font-mono">{hub.code}</td>
              <td className="p-3">{hub.city ?? hub.region ?? "—"}</td>
              <td className="p-3">{hub.warehouseName ?? "—"}</td>
              <td className="p-3 text-center">
                {hub.assignedToday}
                {hub.capacity !== null && ` / ${hub.capacity}`}
                {hub.capacity !== null && hub.assignedToday >= hub.capacity && (
                  <span className="ml-1 text-xs font-semibold text-accent">FULL</span>
                )}
              </td>
              <td className="p-3 text-center">
                {hub.isDefault ? (
                  <span className="rounded bg-primary/15 px-2 py-1 text-xs font-medium text-primary">
                    Default
                  </span>
                ) : (
                  <span className="text-muted/70">-</span>
                )}
              </td>
              <td className="p-3 text-center">
                <span
                  className={`rounded px-2 py-1 text-xs ${
                    hub.active
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-accent/15 text-accent"
                  }`}
                >
                  {hub.active ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="p-3 text-right">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(hub)}
                    className="btn btn-sm btn-outline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggle(hub.id, !hub.active)}
                    className="btn btn-sm btn-outline"
                  >
                    {hub.active ? "Disable" : "Enable"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {!hubs.length && (
            <tr>
              <td colSpan={8} className="p-6 text-center text-muted">
                No delivery hubs yet. Create one to start routing orders to pickup points.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
