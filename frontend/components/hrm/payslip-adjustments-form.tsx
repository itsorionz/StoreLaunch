"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { savePayslip, type HrmActionResult } from "@backend/actions/hrm";
import { ValidatedForm, ValidationInput } from "@frontend/components/ui/validated-form";

/** Editable allowances/deductions line before payment. */
export function PayslipAdjustmentsForm({
  payslipId,
  allowancesCents,
  deductionsCents,
  note,
  locked,
}: {
  payslipId: string;
  allowancesCents: number;
  deductionsCents: number;
  note: string;
  locked: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<HrmActionResult, FormData>(savePayslip, null);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  if (locked)
    return (
      <p className="text-xs text-muted">
        Paid — adjustments are locked.
        {note && <span className="block italic">“{note}”</span>}
      </p>
    );

  return (
    <ValidatedForm
      action={action}
      errors={state?.fieldErrors}
      result={state}
      successMessage="Payslip updated."
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="id" value={payslipId} />
      <label className="grid gap-1 text-xs font-medium">
        Allowances
        <ValidationInput
          name="allowances"
          defaultValue={allowancesCents ? (allowancesCents / 100).toFixed(2) : ""}
          className="input w-28"
          inputMode="decimal"
          placeholder="0.00"
        />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Deductions
        <ValidationInput
          name="deductions"
          defaultValue={deductionsCents ? (deductionsCents / 100).toFixed(2) : ""}
          className="input w-28"
          inputMode="decimal"
          placeholder="0.00"
        />
      </label>
      <label className="grid grow gap-1 text-xs font-medium">
        Note
        <ValidationInput
          name="note"
          defaultValue={note}
          className="input"
          placeholder="e.g. festival bonus, late fine"
        />
      </label>
      <button type="submit" disabled={pending} className="btn-outline btn-sm disabled:opacity-50">
        {pending ? "Saving…" : "Save line"}
      </button>
    </ValidatedForm>
  );
}
