"use client";

import { useState } from "react";
import { createWarehouse, updateWarehouse, toggleWarehouse } from "@backend/actions/admin";

type WarehouseRow = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  isDefault: boolean;
  active: boolean;
  stockLevelCount: number;
};

export function WarehouseManager({ warehouses }: { warehouses: WarehouseRow[] }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<{
    name: string;
    code: string;
    address: string | null;
  } | null>(null);

  const handleSave = async (formData: FormData) => {
    const result = await createWarehouse(null, formData);
    if (result.ok) {
      setShowForm(false);
      window.location.reload();
    }
  };

  const handleUpdate = async (formData: FormData) => {
    const result = await updateWarehouse(null, formData);
    if (result.ok) {
      setEditId(null);
      setEditData(null);
      window.location.reload();
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    const formData = new FormData();
    formData.append("id", id);
    formData.append("active", active.toString());
    const result = await toggleWarehouse(null, formData);
    if (result.ok) {
      window.location.reload();
    }
  };

  return (
    <div>
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Warehouses</h1>
          <p className="text-muted">Manage warehouse locations and stock levels</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowForm(true)} className="btn btn-primary">
            + Add Warehouse
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card p-4 mb-6">
          <h3 className="font-medium mb-3">Add Warehouse</h3>
          <form action={handleSave} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Name</label>
                <input name="name" type="text" className="input" required />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Code</label>
                <input name="code" type="text" className="input" placeholder="MAIN" required />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Address</label>
                <input
                  name="address"
                  type="text"
                  className="input"
                  placeholder="Warehouse address"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" name="isDefault" className="checkbox" />
              <label className="text-sm">Default warehouse</label>
            </div>
            <button className="btn btn-primary" type="submit">
              Create Warehouse
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn btn-ghost">
              Cancel
            </button>
          </form>
        </div>
      )}

      {editId && editData && (
        <div className="card p-4 mb-6">
          <h3 className="font-medium mb-3">Edit Warehouse</h3>
          <form action={handleUpdate} className="space-y-3">
            <input type="hidden" name="id" value={editId} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Name</label>
                <input name="name" type="text" defaultValue={editData.name} required />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Code</label>
                <input name="code" type="text" defaultValue={editData.code} required />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Address</label>
                <input
                  name="address"
                  type="text"
                  defaultValue={editData.address ?? ""}
                  placeholder="Warehouse address"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" name="isDefault" defaultChecked={false} className="checkbox" />
              <label className="text-sm">Default warehouse</label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" name="active" defaultChecked={true} className="checkbox" />
              <label className="text-sm">Active</label>
            </div>
            <button className="btn btn-primary" type="submit">
              Update Warehouse
            </button>
            <button type="button" onClick={() => setEditId(null)} className="btn btn-ghost">
              Cancel
            </button>
          </form>
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            <th className="text-left p-3">Name</th>
            <th className="text-left p-3">Code</th>
            <th className="text-left p-3">Address</th>
            <th className="text-center p-3">Stock Items</th>
            <th className="text-center p-3">Default</th>
            <th className="text-center p-3">Status</th>
            <th className="text-right p-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {warehouses.map((w) => (
            <tr key={w.id} className="border-b border-border">
              <td className="p-3">{w.name}</td>
              <td className="text-right p-3 font-mono">{w.code}</td>
              <td className="p-3">{w.address ?? "—"}</td>
              <td className="text-right p-3">{w.stockLevelCount}</td>
              <td className="text-center p-3">
                {w.isDefault ? (
                  <span className="rounded bg-primary/15 px-2 py-1 text-xs font-medium text-primary">
                    Default
                  </span>
                ) : (
                  <span className="bg-surface-2 px-2 py-1 text-xs text-muted">-</span>
                )}
              </td>
              <td className="text-center p-3">
                <button
                  onClick={() => handleToggle(w.id, !w.active)}
                  className={`btn btn-xs btn-circle ${w.active ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-accent/15 text-accent"}`}
                />
              </td>
              <td className="text-right p-3">
                <button
                  onClick={() => {
                    const wData = warehouses.find((w2) => w2.id === w.id);
                    if (!wData) return;
                    setEditData({
                      name: wData.name,
                      code: wData.code,
                      address: wData.address ?? "",
                    });
                    setEditId(w.id);
                  }}
                  className="btn btn-sm btn-outline"
                >
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
