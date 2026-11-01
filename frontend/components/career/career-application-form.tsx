"use client";

import { useActionState } from "react";
import { submitCareerApplication, type CareerActionResult } from "@backend/actions/career";
import {
  ValidatedForm,
  ValidationInput,
  ValidationTextarea,
} from "@frontend/components/ui/validated-form";

export function CareerApplicationForm({
  jobId,
  jobTitle,
  initialValues,
}: {
  jobId: string;
  jobTitle: string;
  initialValues?: { name: string; email: string; phone: string };
}) {
  const [state, action, pending] = useActionState<CareerActionResult | null, FormData>(
    submitCareerApplication,
    null,
  );

  if (state?.ok) {
    return (
      <div role="status" className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <p className="font-semibold text-primary">Application received</p>
        <p className="mt-1 text-sm text-muted">
          Thank you for applying for {jobTitle}. Our team will review your application.
        </p>
      </div>
    );
  }

  return (
    <ValidatedForm
      action={action}
      errors={state?.fieldErrors}
      result={state}
      successMessage="Application received."
      noValidate
      className="space-y-4 rounded-2xl border border-border bg-surface p-5 sm:p-6"
    >
      <input type="hidden" name="jobId" value={jobId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Full name
          <ValidationInput
            name="name"
            required
            defaultValue={initialValues?.name ?? ""}
            readOnly={Boolean(initialValues?.name)}
            autoComplete="name"
            maxLength={100}
            className="input mt-1 read-only:bg-surface-2 read-only:text-muted"
            placeholder="Your full name"
          />
        </label>
        <label className="block text-sm font-medium">
          Email address
          <ValidationInput
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={initialValues?.email ?? ""}
            readOnly={Boolean(initialValues?.email)}
            maxLength={254}
            className="input mt-1 read-only:bg-surface-2 read-only:text-muted"
            placeholder="you@example.com"
          />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Phone number
          <ValidationInput
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            defaultValue={initialValues?.phone ?? ""}
            readOnly={Boolean(initialValues?.phone)}
            maxLength={30}
            className="input mt-1 read-only:bg-surface-2 read-only:text-muted"
            placeholder="+880 1XXX XXXXXX"
          />
        </label>
        <label className="block text-sm font-medium">
          Upload your CV <span className="font-normal text-muted">(PDF, max 5 MB)</span>
          <ValidationInput
            name="resumeFile"
            type="file"
            accept="application/pdf,.pdf"
            className="input mt-1 file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary"
          />
          <span className="mt-1 block text-xs font-normal text-muted">
            Or provide a link instead.
          </span>
        </label>
        <label className="block text-sm font-medium">
          Resume or portfolio link{" "}
          <span className="font-normal text-muted">(optional if CV uploaded)</span>
          <ValidationInput
            name="resumeUrl"
            type="url"
            maxLength={2048}
            className="input mt-1"
            placeholder="https://example.com/your-resume"
          />
        </label>
      </div>
      <label className="block text-sm font-medium">
        Cover letter
        <ValidationTextarea
          name="coverLetter"
          required
          minLength={30}
          maxLength={5000}
          rows={6}
          className="input mt-1"
          placeholder="Tell us about your experience and why this role interests you."
        />
      </label>

      <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden>
        <label>
          Leave this field empty
          <ValidationInput name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="flex items-start gap-2 text-xs leading-relaxed text-muted">
        <ValidationInput
          type="checkbox"
          name="consent"
          value="on"
          required
          className="mt-0.5 h-4 w-4 accent-primary"
        />
        <span>
          I agree that StoreLaunch may use the information I provide to review this application and
          contact me about this role.
        </span>
      </label>

      {state?.error && !state.fieldErrors && (
        <p role="alert" className="rounded-lg bg-accent/10 p-3 text-sm text-accent">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
        {pending ? "Submitting…" : "Submit application"}
      </button>
    </ValidatedForm>
  );
}
