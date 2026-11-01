"use client";

import { useActionState } from "react";
import { adjustProductStock } from "@backend/actions/inventory";
import {
  ValidatedForm,
  ValidationInput,
  ValidationTextarea,
} from "@frontend/components/ui/validated-form";

export function InventoryAdjustmentForm({
  productId,
  stock,
  updatedAt,
  requestKey,
}: {
  productId: string;
  stock: number;
  updatedAt: string;
  requestKey: string;
}) {
  const [state, action, pending] = useActionState(adjustProductStock, null);
  return (
    <section id="inventory" className="mt-6 rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-lg font-bold">Adjust inventory</h2>
      <p className="mt-1 text-sm text-muted">
        Available stock: {stock}. Enter a positive quantity for received stock or a negative
        quantity for a removal. Every adjustment keeps its reason and administrator.
      </p>
      <ValidatedForm
        action={action}
        errors={state?.fieldErrors}
        result={state}
        successMessage="Stock adjustment saved."
        noValidate
        className="mt-4 space-y-4"
      >
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="requestKey" value={requestKey} />
        <input type="hidden" name="expectedStock" value={stock} />
        <input type="hidden" name="expectedUpdatedAt" value={updatedAt} />
        {state?.error && (
          <p role="alert" className="text-sm text-accent">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p role="status" className="text-sm text-primary">
            Stock adjusted: {state.previousStock} to {state.newStock}. Refresh before making another
            adjustment.
          </p>
        )}
        <label className="block text-sm font-medium">
          Quantity change
          <ValidationInput
            className="input mt-1"
            type="number"
            step="1"
            name="delta"
            placeholder="For example, 10 or -2"
            required
          />
        </label>
        <label className="block text-sm font-medium">
          Reason
          <ValidationTextarea
            className="input mt-1"
            name="reason"
            placeholder="Delivery received, damaged stock removed, or count correction"
            maxLength={500}
            rows={3}
            required
          />
        </label>
        <button type="submit" disabled={pending || state?.ok} className="btn-primary">
          {pending ? "Saving adjustment..." : "Save stock adjustment"}
        </button>
        <a href={`/admin/products/${productId}#inventory`} className="ml-3 text-sm text-primary">
          Refresh current stock
        </a>
      </ValidatedForm>
    </section>
  );
}
