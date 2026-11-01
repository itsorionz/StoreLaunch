"use client";

import {
  ValidatedForm,
  ValidationInput,
  ValidationTextarea,
  ActionResultToast,
} from "@frontend/components/ui/validated-form";

import { useActionState } from "react";
import { sendFeedback, type FeedbackState } from "@backend/actions/feedback";
import { useDict } from "@frontend/i18n/provider";

export function FeedbackForm({ kind }: { kind: "suggest" | "rider" }) {
  const dict = useDict();
  const [state, action, pending] = useActionState<FeedbackState | null, FormData>(
    sendFeedback,
    null,
  );

  const successText = kind === "rider" ? dict.account.riderSent : dict.account.suggestSent;

  if (state?.ok) {
    return (
      <>
        <ActionResultToast result={state} successMessage={successText} />
        <div className="card bg-primary-light p-6 text-sm font-medium text-primary-dark">
          {successText}
        </div>
      </>
    );
  }

  return (
    <ValidatedForm
      errors={state?.fieldErrors}
      result={state}
      noValidate
      action={action}
      className="card space-y-4 p-6"
    >
      <ValidationInput type="hidden" name="kind" value={kind} />
      {state?.error && !state.fieldErrors && (
        <p
          role="alert"
          className="rounded-lg bg-accent/10 px-3 py-2.5 text-sm font-medium text-accent"
        >
          {state.error}
        </p>
      )}

      {kind === "rider" && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{dict.account.rateAvg}</legend>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="cursor-pointer">
                <ValidationInput
                  type="radio"
                  name="rating"
                  value={n}
                  defaultChecked={n === 5}
                  className="peer sr-only"
                />
                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-lg text-amber-500 transition-colors peer-checked:border-amber-500 peer-checked:bg-amber-500/10">
                  {n}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label className="block">
        <span className="sr-only">message</span>
        <ValidationTextarea
          name="message"
          required
          rows={5}
          maxLength={2000}
          placeholder={
            kind === "rider" ? dict.account.riderPlaceholder : dict.account.suggestPlaceholder
          }
          className="input resize-y"
        />
      </label>

      <button type="submit" disabled={pending} className="btn-primary">
        {pending
          ? "…"
          : kind === "rider"
            ? dict.account.submitRider
            : dict.account.submitSuggestion}
      </button>
    </ValidatedForm>
  );
}
