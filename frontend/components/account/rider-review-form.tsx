"use client";

import {
  ValidatedForm,
  ValidationInput,
  ValidationTextarea,
  FieldError,
  ActionResultToast,
} from "@frontend/components/ui/validated-form";

import { useState, useActionState } from "react";
import { submitRiderReview, type ReviewFormState } from "@backend/actions/review";
import { useDict } from "@frontend/i18n/provider";

export function RiderReviewForm({ orderId }: { orderId: string }) {
  const dict = useDict();
  const [state, action, pending] = useActionState<ReviewFormState | null, FormData>(
    submitRiderReview,
    null,
  );
  const [rating, setRating] = useState(0);
  const [open, setOpen] = useState(false);

  if (state?.ok) {
    return (
      <>
        <ActionResultToast result={state} successMessage={dict.account.riderSent} />
        <p className="rounded-lg bg-primary-light px-3 py-2 text-xs font-medium text-primary-dark">
          {dict.account.riderSent}
        </p>
      </>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-outline btn-sm shrink-0">
        {dict.account.reviewWrite}
      </button>
    );
  }

  return (
    <ValidatedForm
      errors={state?.fieldErrors}
      result={state}
      noValidate
      action={action}
      className="w-full space-y-2.5"
    >
      <ValidationInput type="hidden" name="orderId" value={orderId} />
      <ValidationInput type="hidden" name="rating" value={rating} />
      <FieldError name="rating" />

      {state?.error && !state.fieldErrors && (
        <p
          role="alert"
          className="rounded-lg bg-accent/10 px-3 py-2 text-xs font-medium text-accent"
        >
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted">{dict.account.reviewRating}</span>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              className={`px-0.5 text-xl leading-none transition-colors ${
                n <= rating ? "text-amber-500" : "text-muted/40 hover:text-amber-400"
              }`}
            >
              {n <= rating ? "★" : "☆"}
            </button>
          ))}
        </div>
      </div>

      <ValidationTextarea
        name="body"
        rows={3}
        maxLength={2000}
        placeholder={dict.account.riderPlaceholder}
        className="input resize-y text-sm"
      />

      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending || rating < 1} className="btn-primary btn-sm">
          {pending ? "…" : dict.account.submitRider}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn-sm text-muted hover:text-foreground"
        >
          {dict.common.cancel}
        </button>
      </div>
    </ValidatedForm>
  );
}
