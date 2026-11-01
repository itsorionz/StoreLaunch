"use client";

import { ValidatedForm, ValidationInput } from "@frontend/components/ui/validated-form";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createCustomerService, type AdminActionResult } from "@backend/actions/admin";
import { Modal } from "@frontend/components/ui/modal";

export function AddSupportAgentModal() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState<AdminActionResult | null, FormData>(
    createCustomerService,
    null,
  );

  const onSavedRef = useRef(() => {
    setOpen(false);
    router.refresh();
  });
  useEffect(() => {
    if (state?.ok) onSavedRef.current();
  }, [state]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-outline">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add support agent
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add support agent">
        <ValidatedForm
          errors={state?.fieldErrors}
          result={state}
          successMessage="Support agent created."
          noValidate
          action={action}
          className="space-y-4"
        >
          {state?.error && !state.fieldErrors && !state.ok && (
            <p
              role="alert"
              className="rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent"
            >
              {state.error}
            </p>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Name</span>
            <ValidationInput
              type="text"
              name="name"
              required
              minLength={2}
              className="input"
              placeholder="Full name"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Email</span>
            <ValidationInput
              type="email"
              name="email"
              required
              className="input"
              placeholder="agent@example.com"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Password</span>
            <ValidationInput
              type="password"
              name="password"
              required
              minLength={8}
              className="input"
              placeholder="Min 8 characters"
            />
            <span className="mt-1 block text-xs text-muted">
              The agent signs in with this password and lands in the support portal to answer
              customer chat.
            </span>
          </label>
          <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
            {pending ? "Creating…" : "Create agent"}
          </button>
        </ValidatedForm>
      </Modal>
    </>
  );
}
