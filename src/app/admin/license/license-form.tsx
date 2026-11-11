"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ValidatedForm, ValidationInput } from "@frontend/components/ui/validated-form";
import {
  activateLicenseAction,
  type ActivateLicenseOutcome,
} from "@backend/actions/license";

export function LicenseForm() {
  const router = useRouter();
  const [result, action, pending] = useActionState<ActivateLicenseOutcome | null, FormData>(
    activateLicenseAction,
    null,
  );
  const onSavedRef = useRef(() => {
    router.refresh();
  });
  useEffect(() => {
    if (result?.ok) onSavedRef.current();
  }, [result]);

  return (
    <section className="card p-5 sm:p-6" aria-label="Activate license">
      <h2 className="font-bold">Activate license</h2>
      <p className="mt-1 text-xs text-muted">
        Enter a license key (format:{" "}
        <code className="rounded bg-surface-2 px-1 py-0.5">SL1.…</code>) to activate or replace
        the current license. Keys are generated offline — see{" "}
        <code className="rounded bg-surface-2 px-1 py-0.5">backend/scripts/license.ts</code>.
      </p>
      <ValidatedForm
        errors={result?.fieldErrors}
        result={result}
        successMessage="License activated successfully."
        noValidate
        action={action}
        className="space-y-4 mt-4"
      >
        {result && !result.ok && result.error && (
          <p
            role="alert"
            className="rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent"
          >
            {result.error}
          </p>
        )}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">License key</span>
          <ValidationInput
            type="text"
            name="licenseKey"
            required
            placeholder="SL1.eyJ…"
            className="input w-full max-w-lg"
          />
        </label>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Activating…" : "Activate license"}
        </button>
      </ValidatedForm>
    </section>
  );
}
