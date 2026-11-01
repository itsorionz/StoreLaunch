"use client";

import { useActionState, type KeyboardEvent } from "react";
import {
  ValidatedForm,
  ValidationInput,
  ValidationTextarea,
} from "@frontend/components/ui/validated-form";
import type { ChatFormState } from "@backend/actions/chat";

// Shared composer for both portals. Without a conversationId it starts a new
// thread (optionally about an order); with one it replies. Enter sends,
// Shift+Enter inserts a newline.
export function ChatComposer({
  action,
  conversationId,
  orderId,
  subjectPlaceholder,
  placeholder,
  sendLabel,
}: {
  action: (prev: ChatFormState, form: FormData) => Promise<ChatFormState>;
  conversationId?: string;
  orderId?: string;
  subjectPlaceholder?: string;
  placeholder: string;
  sendLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ChatFormState, FormData>(action, null);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <ValidatedForm
      errors={state?.fieldErrors}
      result={state}
      successToast={false}
      action={formAction}
      noValidate
      className="space-y-2"
    >
      {conversationId && (
        <input type="hidden" name="conversationId" defaultValue={conversationId} />
      )}
      {orderId && <input type="hidden" name="orderId" defaultValue={orderId} />}
      {subjectPlaceholder && (
        <ValidationInput
          type="text"
          name="subject"
          maxLength={120}
          aria-label={subjectPlaceholder}
          placeholder={subjectPlaceholder}
          className="input"
        />
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <ValidationTextarea
          name="body"
          rows={3}
          maxLength={2000}
          required
          placeholder={placeholder}
          className="input min-h-20 flex-1 resize-none"
          onKeyDown={onKeyDown}
        />
        <button type="submit" disabled={pending} className="btn-primary sm:shrink-0">
          {sendLabel}
        </button>
      </div>
    </ValidatedForm>
  );
}
