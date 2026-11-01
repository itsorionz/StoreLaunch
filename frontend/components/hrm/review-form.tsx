"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveReview, removeReview, type HrmActionResult } from "@backend/actions/hrm";
import {
  ValidatedForm,
  ValidationInput,
  ValidationSelect,
  ValidationTextarea,
} from "@frontend/components/ui/validated-form";
import { useConfirm } from "@frontend/components/ui/confirm-dialog";
import { useToast } from "@frontend/components/ui/toast";

type Option = { id: string; label: string };

export function ReviewForm({
  options,
  presetEmployeeId = "",
}: {
  options: Option[];
  presetEmployeeId?: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<HrmActionResult, FormData>(saveReview, null);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <ValidatedForm
      action={action}
      errors={state?.fieldErrors}
      result={state}
      successMessage="Review saved."
      className="card space-y-4 p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">
          Employee
          <ValidationSelect
            name="employeeId"
            defaultValue={presetEmployeeId}
            className="input"
            required
          >
            <option value="">Select an employee…</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </ValidationSelect>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Rating (1–5)
          <ValidationSelect name="rating" defaultValue="4" className="input">
            {[5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={value}>
                {value} —{" "}
                {
                  [
                    "Needs support",
                    "Below expectations",
                    "Meets expectations",
                    "Exceeds",
                    "Exceptional",
                  ][value - 1]
                }
              </option>
            ))}
          </ValidationSelect>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Period from
          <ValidationInput type="date" name="periodStart" className="input" required />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Period to
          <ValidationInput type="date" name="periodEnd" className="input" required />
        </label>
      </div>
      <label className="grid gap-1 text-sm font-medium">
        Summary <span className="text-muted">(optional)</span>
        <ValidationTextarea name="summary" rows={2} className="input" />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium">
          Strengths
          <ValidationTextarea name="strengths" rows={2} className="input" />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Improvements
          <ValidationTextarea name="improvements" rows={2} className="input" />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Goals
          <ValidationTextarea name="goals" rows={2} className="input" />
        </label>
      </div>
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Saving…" : "Save review"}
      </button>
    </ValidatedForm>
  );
}

export function ReviewDeleteButton({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="btn-outline btn-sm text-accent disabled:opacity-50"
      onClick={() =>
        startTransition(async () => {
          if (
            !(await confirm({
              title: "Delete this review?",
              description: "The review will be permanently removed.",
              confirmLabel: "Delete",
            }))
          )
            return;
          const result = await removeReview(reviewId);
          if (result?.ok) {
            toast("Review deleted.");
            router.refresh();
          } else toast(result?.error ?? "Could not delete the review.", "error");
        })
      }
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
