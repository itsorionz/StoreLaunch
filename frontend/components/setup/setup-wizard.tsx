"use client";

import { useState, useTransition } from "react";
import { completeSetup, type SetupState } from "@backend/actions/setup";
import { useLang } from "@frontend/i18n/provider";
import { formPlaceholder } from "@frontend/lib/form-placeholders";
import { ActionResultToast } from "@frontend/components/ui/validated-form";

const steps = ["License", "Your account", "Store details"];

export function SetupWizard() {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<SetupState>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await completeSetup(null, formData);
      if (result) {
        setState(result);
        const fields = Object.keys(result.fieldErrors ?? {});
        if (fields.includes("licenseKey")) setStep(0);
        else if (fields.some((field) => ["adminName", "email", "password"].includes(field)))
          setStep(1);
      }
    });
  }

  const fe = state?.fieldErrors ?? {};

  return (
    <div className="w-full">
      <ActionResultToast result={state} successMessage="Setup complete." />
      <div className="mb-6 flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex flex-1 flex-col gap-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className={`h-full rounded-full bg-primary transition-all duration-300 ${i <= step ? "w-full" : "w-0"}`}
              />
            </div>
            <span
              className={`text-xs font-medium ${i === step ? "font-semibold text-primary" : "text-muted"}`}
            >
              {i + 1}. {s}
            </span>
          </div>
        ))}
      </div>

      {state?.error && !state.fieldErrors && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-accent/10 px-3 py-2.5 text-sm font-medium text-accent"
        >
          {state.error}
        </p>
      )}

      <form noValidate onSubmit={onSubmit} className="space-y-4">
        <fieldset hidden={step !== 0} className="space-y-4">
          <Field
            label="License key"
            name="licenseKey"
            error={fe.licenseKey?.[0]}
            placeholder="SL1...."
            required
          />
          <p className="text-xs leading-relaxed text-muted">
            Enter the license key provided by your StoreLaunch provider.
          </p>
        </fieldset>

        <fieldset hidden={step !== 1} className="space-y-4">
          <Field label="Your name" name="adminName" error={fe.adminName?.[0]} required />
          <Field label="Email" name="email" type="email" error={fe.email?.[0]} required />
          <Field
            label="Password"
            name="password"
            type="password"
            error={fe.password?.[0]}
            required
          />
        </fieldset>

        <fieldset hidden={step !== 2} className="space-y-4">
          <Field label="Store name" name="storeName" error={fe.storeName?.[0]} required />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Currency symbol"
              name="currencySymbol"
              defaultValue="৳"
              error={fe.currencySymbol?.[0]}
              required
            />
            <Field
              label="Currency code"
              name="currencyCode"
              defaultValue="BDT"
              error={fe.currencyCode?.[0]}
              required
            />
          </div>
          <Field
            label="Contact email (optional)"
            name="contactEmail"
            type="email"
            error={fe.contactEmail?.[0]}
          />
          <Field
            label="Contact phone (optional)"
            name="contactPhone"
            error={fe.contactPhone?.[0]}
          />
          <Field
            label="Delivery estimate"
            name="deliveryEstimate"
            defaultValue="12-24 HOURS"
            error={fe.deliveryEstimate?.[0]}
          />
        </fieldset>

        <div className="flex gap-3 pt-3">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="btn-outline flex-1"
            >
              Back
            </button>
          )}
          {step < 2 ? (
            <button
              type="button"
              onClick={(event) => {
                const current = event.currentTarget.form?.querySelector("fieldset:not([hidden])");
                const inputs = Array.from(current?.querySelectorAll("input") ?? []);
                if (inputs.every((input) => input.reportValidity())) setStep((s) => s + 1);
              }}
              className="btn-primary flex-1"
            >
              Continue
            </button>
          ) : (
            <button type="submit" disabled={pending} className="btn-primary flex-1">
              {pending ? "Setting up..." : "Launch store"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  defaultValue,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  error?: string;
}) {
  const lang = useLang();
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">{label}</span>
      <input
        type={type}
        name={name}
        required={required}
        placeholder={placeholder || formPlaceholder(name, lang, type)}
        defaultValue={defaultValue}
        className="input"
      />
      {error && (
        <span role="alert" data-field-error={name} className="mt-1 block text-xs text-accent">
          {error.replace(/^[^:]+:\s*/, "")}
        </span>
      )}
    </label>
  );
}
