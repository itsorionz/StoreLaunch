"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { CareerApplicationStatuses } from "@backend/lib/enums.mjs";
import { updateCareerApplicationStatus, type CareerActionResult } from "@backend/actions/career";
import {
  ValidatedForm,
  ValidationInput,
  ValidationSelect,
} from "@frontend/components/ui/validated-form";
import { useToast } from "@frontend/components/ui/toast";

export function CareerApplicationStatusForm({
  applicationId,
  status,
}: {
  applicationId: string;
  status: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, action, pending] = useActionState<CareerActionResult | null, FormData>(
    async (previous, formData) => {
      const result = await updateCareerApplicationStatus(previous, formData);
      if (result.ok) {
        toast("Application status updated");
        router.refresh();
      }
      return result;
    },
    null,
  );

  return (
    <ValidatedForm
      action={action}
      errors={state?.fieldErrors}
      result={state}
      successToast={false}
      noValidate
      className="flex flex-wrap items-start gap-2"
    >
      <ValidationInput type="hidden" name="applicationId" value={applicationId} />
      <div className="min-w-36">
        <ValidationSelect name="status" defaultValue={status} className="input py-2 text-xs">
          <option value={CareerApplicationStatuses.New}>New</option>
          <option value={CareerApplicationStatuses.Reviewing}>Reviewing</option>
          <option value={CareerApplicationStatuses.Shortlisted}>Shortlisted</option>
          <option value={CareerApplicationStatuses.Rejected}>Rejected</option>
          <option value={CareerApplicationStatuses.Hired}>Hired</option>
        </ValidationSelect>
      </div>
      <button type="submit" disabled={pending} className="btn-outline btn-sm">
        {pending ? "Saving…" : "Update"}
      </button>
      {state?.error && !state.fieldErrors && (
        <p role="alert" className="w-full text-xs text-accent">
          {state.error}
        </p>
      )}
    </ValidatedForm>
  );
}
