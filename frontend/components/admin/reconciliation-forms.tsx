"use client";

import { ValidatedForm, ValidationInput } from "@frontend/components/ui/validated-form";

import { useActionState } from "react";
import { remitCodAction } from "@backend/actions/reconciliation";
import { CodSettlementMethods } from "@backend/lib/enums.mjs";
import { ValidationSelect } from "@frontend/components/ui/validated-form";

export function CodRemittanceForm({ orderId, amount }: { orderId: string; amount: string }) {
  const [state, action, pending] = useActionState(remitCodAction, null);
  return (
    <ValidatedForm
      errors={state?.fieldErrors}
      result={state}
      successMessage="COD remittance recorded."
      noValidate
      action={action}
      className="mt-3 space-y-3"
    >
      <ValidationInput type="hidden" name="orderId" value={orderId} />
      <p className="text-xs text-muted">
        Confirm only after the store has received the full {amount}. This records receipt; it does
        not transfer money.
      </p>
      <label className="block text-sm font-medium">
        Receipt method
        <ValidationSelect
          name="method"
          className="input mt-1"
          defaultValue={CodSettlementMethods.Other}
        >
          <option value={CodSettlementMethods.Cash}>Cash</option>
          <option value={CodSettlementMethods.BankTransfer}>Bank transfer</option>
          <option value={CodSettlementMethods.MobileFinancialService}>
            Mobile financial service
          </option>
          <option value={CodSettlementMethods.Other}>Other</option>
        </ValidationSelect>
      </label>
      <label className="block text-sm font-medium">
        Receipt or deposit reference
        <ValidationInput
          name="reference"
          required
          minLength={3}
          maxLength={120}
          className="input mt-1"
          autoComplete="off"
        />
      </label>
      {state?.error && !state.fieldErrors && (
        <p role="alert" className="text-sm text-accent">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-sm text-primary">
          Store receipt recorded.
        </p>
      )}
      <button disabled={pending || state?.ok === true} className="btn-primary w-full">
        {pending ? "Saving…" : "Confirm full amount received"}
      </button>
    </ValidatedForm>
  );
}
