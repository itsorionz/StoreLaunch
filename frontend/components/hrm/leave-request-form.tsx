"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LeaveTypes } from "@backend/lib/enums.mjs";
import { saveLeaveRequest, type HrmActionResult } from "@backend/actions/hrm";
import {
  ValidatedForm,
  ValidationInput,
  ValidationSelect,
  ValidationTextarea,
} from "@frontend/components/ui/validated-form";

type Option = { id: string; label: string };

/** Admin-entered leave request (the owner records time off on someone's behalf). */
export function LeaveRequestForm({ options }: { options: Option[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<HrmActionResult, FormData>(
    saveLeaveRequest,
    null,
  );
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <ValidatedForm
      action={action}
      errors={state?.fieldErrors}
      result={state}
      successMessage="Leave request recorded."
      className="card space-y-4 p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">
          Employee
          <ValidationSelect name="employeeId" className="input" required>
            <option value="">Select an employee…</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </ValidationSelect>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Leave type
          <ValidationSelect name="type" defaultValue={LeaveTypes.Annual} className="input">
            {Object.values(LeaveTypes).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </ValidationSelect>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          From
          <ValidationInput type="date" name="startDate" className="input" required />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          To
          <ValidationInput type="date" name="endDate" className="input" required />
        </label>
      </div>
      <label className="grid gap-1 text-sm font-medium">
        Reason
        <ValidationTextarea name="reason" rows={2} className="input" required />
      </label>
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Saving…" : "Record request"}
      </button>
    </ValidatedForm>
  );
}
