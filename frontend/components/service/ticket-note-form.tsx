"use client";

import { useEffect, useRef, useActionState } from "react";
import { useDict } from "@frontend/i18n/provider";
import { ValidatedForm, ValidationTextarea } from "@frontend/components/ui/validated-form";
import { addTicketNoteAction, type TicketFormState } from "@backend/actions/support-tickets";

// Internal-note composer for a ticket thread. Success clears the box; closed
// tickets get a read-only hint instead (enforced again on the server).
export function TicketNoteForm({ ticketId, closed }: { ticketId: string; closed: boolean }) {
  const dict = useDict();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<TicketFormState, FormData>(
    addTicketNoteAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  if (closed) {
    return (
      <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-3 text-center text-sm text-muted">
        {dict.service.closedNoteHint}
      </p>
    );
  }

  return (
    <ValidatedForm
      ref={formRef}
      action={formAction}
      errors={state?.fieldErrors}
      result={state}
      successMessage={dict.service.notePosted}
      noValidate
      className="mt-4 space-y-2"
    >
      <input type="hidden" name="ticketId" defaultValue={ticketId} />
      <label htmlFor={`note-${ticketId}`} className="block text-xs font-semibold text-foreground">
        {dict.service.addNote}
      </label>
      <ValidationTextarea
        id={`note-${ticketId}`}
        name="body"
        rows={3}
        maxLength={2000}
        placeholder={dict.service.notePlaceholder}
        className="input resize-y"
      />
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? dict.service.postingNote : dict.service.postNote}
        </button>
      </div>
    </ValidatedForm>
  );
}
