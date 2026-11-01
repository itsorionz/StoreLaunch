"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  savePayrollRun,
  payPayslip,
  payRun,
  discardPayrollRun,
  type HrmActionResult,
} from "@backend/actions/hrm";
import { ValidatedForm, ValidationInput } from "@frontend/components/ui/validated-form";
import { useConfirm } from "@frontend/components/ui/confirm-dialog";
import { useToast } from "@frontend/components/ui/toast";

/** Generate next month's (or a chosen month's) payroll run. */
export function PayrollRunForm({ defaultMonth }: { defaultMonth: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<HrmActionResult, FormData>(savePayrollRun, null);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <ValidatedForm
      action={action}
      errors={state?.fieldErrors}
      result={state}
      successMessage="Payroll run generated."
      className="card flex flex-wrap items-end gap-3 p-5"
    >
      <label className="grid gap-1 text-sm font-medium">
        Salary month
        <ValidationInput
          type="month"
          name="month"
          defaultValue={defaultMonth}
          className="input w-auto"
          required
        />
      </label>
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Generating…" : "Generate run"}
      </button>
    </ValidatedForm>
  );
}

/** Mark one payslip paid. */
export function PayslipPayButton({ payslipId }: { payslipId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="btn-outline btn-sm disabled:opacity-50"
      onClick={() =>
        startTransition(async () => {
          const result = await payPayslip(payslipId);
          if (result?.ok) {
            toast("Payslip marked paid.");
            router.refresh();
          } else toast(result?.error ?? "Could not mark paid.", "error");
        })
      }
    >
      {pending ? "Saving…" : "Mark paid"}
    </button>
  );
}

/** Run-level actions: pay everything unpaid, or discard a fully-draft run. */
export function RunActions({ runId, fullyPaid }: { runId: string; fullyPaid: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      {!fullyPaid && (
        <button
          type="button"
          disabled={pending}
          className="btn-primary btn-sm disabled:opacity-50"
          onClick={() =>
            startTransition(async () => {
              const result = await payRun(runId);
              if (result?.ok) {
                toast("All unpaid payslips marked paid.");
                router.refresh();
              } else toast(result?.error ?? "Could not mark run paid.", "error");
            })
          }
        >
          {pending ? "Saving…" : "Mark run paid"}
        </button>
      )}
      <button
        type="button"
        disabled={pending || fullyPaid}
        className="btn-outline btn-sm text-accent disabled:opacity-50"
        onClick={() =>
          startTransition(async () => {
            if (
              !(await confirm({
                title: "Delete this payroll run?",
                description:
                  "The run and its payslip lines will be removed. Only fully-unpaid runs can be deleted.",
                confirmLabel: "Delete run",
              }))
            )
              return;
            const result = await discardPayrollRun(runId);
            if (result?.ok) {
              toast("Payroll run deleted.");
              router.push("/hrm/payroll");
              router.refresh();
            } else toast(result?.error ?? "Could not delete the run.", "error");
          })
        }
      >
        {pending ? "Deleting…" : "Delete run"}
      </button>
    </div>
  );
}
