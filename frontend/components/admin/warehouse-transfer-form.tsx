"use client";

import { useState, type FormEvent } from "react";
import { requestStockTransfer, type TransferActionResult } from "@backend/actions/transfers";
import { listWarehouseProducts, type TransferProductHit } from "@backend/actions/warehouse";
import { useToast } from "@frontend/components/ui/toast";

type WarehouseOption = { id: string; name: string; code: string };

export function WarehouseTransferForm({ warehouses }: { warehouses: WarehouseOption[] }) {
  const toast = useToast();
  const [products, setProducts] = useState<TransferProductHit[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    fromWarehouseId: "",
    toWarehouseId: "",
    productId: "",
    qty: "",
    notes: "",
  });

  const loadProducts = async (warehouseId: string) => {
    if (!warehouseId) {
      setProducts([]);
      return;
    }
    setLoadingProducts(true);
    try {
      setProducts(await listWarehouseProducts(warehouseId));
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("fromWarehouseId", formData.fromWarehouseId);
    fd.append("toWarehouseId", formData.toWarehouseId);
    fd.append("productId", formData.productId);
    fd.append("qty", formData.qty);
    fd.append("notes", formData.notes);

    const result: TransferActionResult = await requestStockTransfer(null, fd);
    if (result.ok) {
      setError(null);
      toast("Stock transfer requested.");
      setFormData({
        fromWarehouseId: "",
        toWarehouseId: "",
        productId: "",
        qty: "",
        notes: "",
      });
      setProducts([]);
      setTimeout(() => window.location.reload(), 900);
    } else {
      const message = result.error ?? "Could not request the transfer";
      setError(message);
      toast(message, "error");
    }
  };

  return (
    <div className="card p-6">
      <h2 className="font-medium mb-4">Transfer Stock</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">From Warehouse</label>
            <select
              name="fromWarehouseId"
              value={formData.fromWarehouseId}
              onChange={(e) => {
                const value = e.target.value;
                setFormData((prev) => ({ ...prev, fromWarehouseId: value, productId: "" }));
                void loadProducts(value);
              }}
              className="input"
              required
            >
              <option value="">Select warehouse</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">To Warehouse</label>
            <select
              name="toWarehouseId"
              value={formData.toWarehouseId}
              onChange={(e) => setFormData({ ...formData, toWarehouseId: e.target.value })}
              className="input"
              required
            >
              <option value="">Select warehouse</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id} disabled={w.id === formData.fromWarehouseId}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Product</label>
            <select
              name="productId"
              value={formData.productId}
              onChange={(e) => setFormData({ ...formData, productId: e.target.value })}
              className="input"
              required
              disabled={!formData.fromWarehouseId || loadingProducts}
            >
              <option value="">{loadingProducts ? "Loading products…" : "Select product"}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku}) - {p.qty} in stock
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Quantity</label>
            <input
              name="qty"
              type="number"
              min="1"
              value={formData.qty}
              onChange={(e) => setFormData({ ...formData, qty: e.target.value })}
              className="input"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Notes</label>
            <input
              name="notes"
              type="text"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="input"
              placeholder="Optional notes"
            />
          </div>
        </div>
        {error && <p className="text-sm text-accent">{error}</p>}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={
            !formData.fromWarehouseId ||
            !formData.toWarehouseId ||
            !formData.productId ||
            !formData.qty
          }
        >
          Request Transfer
        </button>
        <p className="text-xs text-muted">
          Transfers start as pending. An admin dispatches them (stock leaves the source) and the
          destination warehouse receives them.
        </p>
      </form>
    </div>
  );
}
