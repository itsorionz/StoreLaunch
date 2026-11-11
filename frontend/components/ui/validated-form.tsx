"use client";

import { createContext, useContext, useEffect, useId, useRef, type ComponentProps } from "react";
import { useLang } from "@frontend/i18n/provider";
import { formPlaceholder } from "@frontend/lib/form-placeholders";
import { useToast } from "@frontend/components/ui/toast";

type Errors = Record<string, string[]> | undefined;
const Fields = createContext<Errors>(undefined);
const aliases: Record<string, string> = {
  price: "priceCents",
  salePrice: "salePriceCents",
  imageFiles: "images",
};

export function ValidatedForm({
  errors,
  result,
  successMessage = "Saved successfully.",
  successToast = true,
  validationToast = false,
  ...props
}: ComponentProps<"form"> & {
  errors?: Errors;
  result?: unknown;
  successMessage?: string;
  successToast?: boolean;
  validationToast?: boolean;
}) {
  return (
    <Fields.Provider value={errors}>
      <ActionResultToast
        result={result}
        errors={errors}
        successMessage={successMessage}
        successToast={successToast}
        validationToast={validationToast}
      />
      <form {...props} />
    </Fields.Provider>
  );
}

export function ActionResultToast({
  result,
  errors,
  successMessage = "Saved successfully.",
  successToast = true,
  validationToast = false,
}: {
  result?: unknown;
  errors?: Errors;
  successMessage?: string;
  successToast?: boolean;
  validationToast?: boolean;
}) {
  const toast = useToast();
  const previousResult = useRef<unknown>(null);
  const previousErrors = useRef<Errors>(undefined);

  useEffect(() => {
    if (result != null && result !== previousResult.current) {
      previousResult.current = result;
      if (typeof result !== "object") return;
      const response = result as Record<string, unknown>;
      if (response.ok === true || response.success === true || response.sent === true) {
        if (successToast || response.sent === true) {
          toast(
            typeof response.message === "string"
              ? response.message
              : response.sent === true
                ? "Verification code sent."
                : successMessage,
            "success",
          );
        }
        // Warnings are caveats, not successes — they surface even when the
        // success toast is suppressed for a flow with its own inline feedback.
        const warning = firstWarning(response);
        if (warning) toast(warning, "warning");
        return;
      }
      const fieldErrors = response.fieldErrors;
      const firstFieldError =
        fieldErrors && typeof fieldErrors === "object"
          ? Object.values(fieldErrors)
              .flat()
              .find((message) => typeof message === "string")
          : undefined;
      const hasFieldErrors = typeof firstFieldError === "string";
      const error = hasFieldErrors
        ? validationToast && typeof firstFieldError === "string" && firstFieldError
        : (typeof response.error === "string" && response.error) ||
          (response.ok === false && typeof response.message === "string" && response.message);
      if (error) toast(error, "error");
      return;
    }

    if (validationToast && result == null && errors && errors !== previousErrors.current) {
      const firstFieldError = Object.values(errors).flat().find(Boolean);
      if (firstFieldError) toast(firstFieldError, "error");
    }
    previousErrors.current = errors;
  }, [errors, result, successMessage, successToast, toast, validationToast]);

  return null;
}

/**
 * Extracts a user-facing warning from an action result:
 * `warning?: string`, or up to two entries of `warnings?: string[]`.
 * Returns undefined when there is nothing to warn about.
 */
function firstWarning(response: Record<string, unknown>): string | undefined {
  if (typeof response.warning === "string" && response.warning.trim())
    return response.warning.trim();
  const warnings = response.warnings;
  if (Array.isArray(warnings)) {
    const list = warnings.filter(
      (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
    );
    if (list.length)
      return list.slice(0, 2).join(" · ") + (list.length > 2 ? ` (+${list.length - 2} more)` : "");
  }
  return undefined;
}

function useField(name?: string, hidden = false) {
  const errors = useContext(Fields);
  const id = useId();
  const message = hidden || !name ? undefined : (errors?.[name] ?? errors?.[aliases[name]])?.[0];
  return { id, message: message?.replace(/^[^:]+:\s*/, "") };
}

function Message({ id, message, name }: { id: string; message?: string; name?: string }) {
  return message ? (
    <span id={id} role="alert" data-field-error={name} className="mt-1 block text-xs text-accent">
      {message}
    </span>
  ) : null;
}

export function ValidationInput(props: ComponentProps<"input">) {
  const field = useField(props.name, props.type === "hidden");
  const lang = useLang();
  return (
    <>
      <input
        {...props}
        placeholder={props.placeholder || formPlaceholder(props.name, lang, props.type)}
        aria-invalid={field.message ? true : undefined}
        aria-describedby={
          [props["aria-describedby"], field.message ? field.id : undefined]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
      <Message {...field} name={props.name} />
    </>
  );
}

export function ValidationSelect(props: ComponentProps<"select">) {
  const field = useField(props.name);
  return (
    <>
      <select
        {...props}
        aria-invalid={field.message ? true : undefined}
        aria-describedby={
          [props["aria-describedby"], field.message ? field.id : undefined]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
      <Message {...field} name={props.name} />
    </>
  );
}

export function ValidationTextarea(props: ComponentProps<"textarea">) {
  const field = useField(props.name);
  const lang = useLang();
  return (
    <>
      <textarea
        {...props}
        placeholder={props.placeholder || formPlaceholder(props.name, lang)}
        aria-invalid={field.message ? true : undefined}
        aria-describedby={
          [props["aria-describedby"], field.message ? field.id : undefined]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
      <Message {...field} name={props.name} />
    </>
  );
}

export function FieldError({ name }: { name: string }) {
  const field = useField(name);
  return <Message {...field} name={name} />;
}
