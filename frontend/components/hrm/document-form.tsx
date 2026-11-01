"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmployeeDocumentKinds } from "@backend/lib/enums.mjs";
import {
  saveEmployeeDocument,
  removeEmployeeDocument,
  type HrmActionResult,
} from "@backend/actions/hrm";
import {
  ValidatedForm,
  ValidationInput,
  ValidationSelect,
} from "@frontend/components/ui/validated-form";
import { useConfirm } from "@frontend/components/ui/confirm-dialog";
import { useToast } from "@frontend/components/ui/toast";

/** Upload (PDF/image ≤ 5 MB) or link an employee document. */
export function DocumentForm({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<HrmActionResult, FormData>(
    saveEmployeeDocument,
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
      successMessage="Document added."
      className="card flex flex-wrap items-end gap-3 p-5"
    >
      <input type="hidden" name="employeeId" value={employeeId} />
      <label className="grid gap-1 text-sm font-medium">
        Title
        <ValidationInput
          name="title"
          className="input w-56"
          placeholder="e.g. Employment contract"
          required
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Kind
        <ValidationSelect
          name="kind"
          defaultValue={EmployeeDocumentKinds.Contract}
          className="input w-auto"
        >
          {Object.values(EmployeeDocumentKinds).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </ValidationSelect>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        File <span className="text-muted">(PDF/image ≤ 5 MB)</span>
        <input
          type="file"
          name="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="input w-auto"
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        …or link <span className="text-muted">(optional)</span>
        <ValidationInput name="url" className="input w-56" placeholder="https://…" />
      </label>
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Adding…" : "Add document"}
      </button>
    </ValidatedForm>
  );
}

export function DocumentDeleteButton({ documentId }: { documentId: string }) {
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
              title: "Delete this document?",
              description: "The stored file or link will be removed permanently.",
              confirmLabel: "Delete",
            }))
          )
            return;
          const result = await removeEmployeeDocument(documentId);
          if (result?.ok) {
            toast("Document deleted.");
            router.refresh();
          } else toast(result?.error ?? "Could not delete the document.", "error");
        })
      }
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
