"use client";

import { useActionState } from "react";
import { CodSettlementMethods } from "@backend/lib/enums.mjs";
import { recordCodSettlementAction } from "@backend/actions/cod-settlement";
import {
  ValidatedForm,
  ValidationInput,
  ValidationSelect,
  ValidationTextarea,
} from "@frontend/components/ui/validated-form";

type Collection = {
  id: string;
  orderNumber: string;
  courier: string;
  amountCents: number;
  settledCents: number;
  currencyCode: string;
  collectedAt: Date;
};
const amount = (cents: number) => (cents / 100).toFixed(2);

export function CodSettlementForm({
  collections,
  courier,
}: {
  collections: Collection[];
  /** Per-courier batch (§9.1): pins the whole form to one courier. */
  courier?: string;
}) {
  const [state, action, pending] = useActionState(recordCodSettlementAction, null);
  return (
    <ValidatedForm
      action={action}
      errors={state?.fieldErrors}
      result={state}
      successMessage="Settlement recorded."
      noValidate
      className="space-y-5"
    >
      {courier && <input type="hidden" name="courier" value={courier} />}
      {state?.error && (
        <p role="alert" className="rounded-xl bg-accent/10 p-3 text-sm text-accent">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="rounded-xl bg-primary/10 p-3 text-sm text-primary">
          Settlement {state.settlementId} recorded. Refresh to see the new outstanding balances.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block text-sm">
          Receipt method
          <ValidationSelect
            name="method"
            className="input mt-1"
            defaultValue={CodSettlementMethods.Cash}
          >
            <option value={CodSettlementMethods.Cash}>Cash</option>
            <option value={CodSettlementMethods.BankTransfer}>Bank transfer</option>
            <option value={CodSettlementMethods.MobileFinancialService}>
              Mobile financial service
            </option>
            <option value={CodSettlementMethods.Other}>Other</option>
          </ValidationSelect>
        </label>
        <label className="block text-sm">
          Receipt / deposit reference
          <ValidationInput
            name="reference"
            className="input mt-1"
            required
            minLength={3}
            maxLength={120}
            placeholder="Unique receipt or transaction reference"
          />
        </label>
        <label className="block text-sm">
          Batch note (optional)
          <ValidationInput
            name="note"
            className="input mt-1"
            maxLength={500}
            placeholder="Additional reconciliation context"
          />
        </label>
      </div>
      <p className="text-sm text-muted">
        Select collections included in this receipt. Enter the amount expected from the courier and
        the amount actually counted. Any short or over amount needs a reason. Partial receipts
        reduce the remaining balance without closing the collection.
      </p>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase text-muted">
            <tr>
              <th className="p-3">Include</th>
              <th className="p-3">Order / courier</th>
              <th className="p-3">Collected</th>
              <th className="p-3">Outstanding</th>
              <th className="p-3">Expected ({collections[0]?.currencyCode ?? "currency"})</th>
              <th className="p-3">Received ({collections[0]?.currencyCode ?? "currency"})</th>
              <th className="p-3">Variance reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {collections.map((row) => {
              const remaining = row.amountCents - row.settledCents;
              return (
                <tr key={row.id}>
                  <td className="p-3">
                    <ValidationInput
                      type="checkbox"
                      name="collectionId"
                      value={row.id}
                      aria-label={`Include order ${row.orderNumber}`}
                    />
                  </td>
                  <td className="p-3">
                    <span className="font-semibold">{row.orderNumber}</span>
                    <span className="block text-xs text-muted">{row.courier}</span>
                  </td>
                  <td className="p-3">
                    {row.collectedAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}
                  </td>
                  <td className="p-3">
                    {row.currencyCode} {amount(remaining)}
                  </td>
                  <td className="p-3">
                    <ValidationInput
                      name={`expected:${row.id}`}
                      className="input w-32"
                      type="number"
                      min="0.01"
                      max={amount(remaining)}
                      step="0.01"
                      defaultValue={amount(remaining)}
                      aria-label={`Expected from order ${row.orderNumber}`}
                    />
                  </td>
                  <td className="p-3">
                    <ValidationInput
                      name={`received:${row.id}`}
                      className="input w-32"
                      type="number"
                      min="0"
                      max="21474836.47"
                      step="0.01"
                      defaultValue={amount(remaining)}
                      aria-label={`Received for order ${row.orderNumber}`}
                    />
                  </td>
                  <td className="p-3">
                    <ValidationTextarea
                      name={`varianceReason:${row.id}`}
                      className="input min-h-16 w-56"
                      rows={2}
                      maxLength={500}
                      placeholder="Required when received differs"
                      aria-label={`Variance reason for order ${row.orderNumber}`}
                    />
                  </td>
                </tr>
              );
            })}
            {!collections.length && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted">
                  No outstanding COD collections.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {collections.length > 0 && (
        <button className="btn-primary" disabled={pending || state?.ok === true}>
          {pending ? "Recording settlement…" : "Record selected cash settlement"}
        </button>
      )}
    </ValidatedForm>
  );
}
