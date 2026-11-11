"use client";

import { useActionState } from "react";
import { ValidatedForm } from "@frontend/components/ui/validated-form";

type FormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

// One button bound to a portal server action (chat take/close, ticket claim,
// status changes): shows pending state and surfaces action errors as toasts.
// Navigation after success, when needed, is the action's own redirect().
export function ServiceFormButton<T extends FormState>({
  action,
  fields,
  label,
  pendingLabel,
  className = "btn-outline",
}: {
  action: (prev: T, form: FormData) => Promise<T>;
  fields: Record<string, string>;
  label: string;
  pendingLabel?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState<T, FormData>(
    action,
    null as unknown as Awaited<T>,
  );

  return (
    <ValidatedForm
      action={formAction}
      errors={state?.fieldErrors}
      result={state}
      successMessage="Action completed."
      noValidate
      className="inline"
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} defaultValue={value} />
      ))}
      <button type="submit" disabled={pending} className={className}>
        {pending ? (pendingLabel ?? label) : label}
      </button>
    </ValidatedForm>
  );
}
