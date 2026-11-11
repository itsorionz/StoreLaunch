"use client";

import { useActionState } from "react";
import { useDict } from "@frontend/i18n/provider";
import { ValidatedForm } from "@frontend/components/ui/validated-form";
import { ServiceFormButton } from "@frontend/components/service/service-form-button";
import {
  assignTicketAction,
  claimTicketAction,
  escalateTicketAction,
  setTicketPriorityAction,
  setTicketStatusAction,
  type TicketFormState,
} from "@backend/actions/support-tickets";

type AgentOption = { id: string; name: string };

// Every workflow control on a ticket: status transitions (only the legal
// next steps), priority, assignment and escalation. Each control is its own
// form bound to a server action, so results surface as toasts without a
// client-side router dance.
export function TicketControls({
  ticketId,
  status,
  priority,
  assignedToId,
  escalated,
  allowedStatuses,
  agents,
  viewerId,
}: {
  ticketId: string;
  status: string;
  priority: string;
  assignedToId: string | null;
  escalated: boolean;
  allowedStatuses: string[];
  agents: AgentOption[];
  viewerId: string;
}) {
  const dict = useDict();
  return (
    <section className="card space-y-4 p-4" aria-label={dict.service.controlsLabel}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {dict.service.statusLabel}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-semibold text-foreground">
            {status}
          </span>
          {allowedStatuses.map((next) => (
            <ServiceFormButton<TicketFormState>
              key={next}
              action={setTicketStatusAction}
              fields={{ ticketId, status: next }}
              label={next}
              className="btn-outline btn-sm"
            />
          ))}
          {allowedStatuses.length === 0 && (
            <span className="text-xs text-muted">No further transitions.</span>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <PriorityForm ticketId={ticketId} priority={priority} />
        <AssignForm ticketId={ticketId} assignee={assignedToId ?? ""} agents={agents} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        {!assignedToId || assignedToId !== viewerId ? (
          <ServiceFormButton<TicketFormState>
            action={claimTicketAction}
            fields={{ ticketId }}
            label={dict.service.claim}
            pendingLabel={dict.service.claiming}
            className="btn-primary"
          />
        ) : (
          <span className="badge badge-primary">{dict.service.mine}</span>
        )}
        {!escalated && <EscalateForm ticketId={ticketId} />}
      </div>
    </section>
  );
}

function PriorityForm({ ticketId, priority }: { ticketId: string; priority: string }) {
  const dict = useDict();
  const [state, formAction, pending] = useActionState<TicketFormState, FormData>(
    setTicketPriorityAction,
    null,
  );
  return (
    <ValidatedForm
      action={formAction}
      errors={state?.fieldErrors}
      result={state}
      successToast={false}
      noValidate
      className="space-y-1.5"
    >
      <input type="hidden" name="ticketId" defaultValue={ticketId} />
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        {dict.service.priorityLabel}
      </label>
      <div className="flex gap-2">
        <select name="priority" defaultValue={priority} className="input min-w-0 flex-1">
          <option value="Low">Low</option>
          <option value="Normal">Normal</option>
          <option value="High">High</option>
          <option value="Urgent">Urgent</option>
        </select>
        <button type="submit" disabled={pending} className="btn-outline shrink-0">
          {pending ? dict.service.saving : dict.service.save}
        </button>
      </div>
    </ValidatedForm>
  );
}

function AssignForm({
  ticketId,
  assignee,
  agents,
}: {
  ticketId: string;
  assignee: string;
  agents: AgentOption[];
}) {
  const dict = useDict();
  const [state, formAction, pending] = useActionState<TicketFormState, FormData>(
    assignTicketAction,
    null,
  );
  return (
    <ValidatedForm
      action={formAction}
      errors={state?.fieldErrors}
      result={state}
      successToast={false}
      noValidate
      className="space-y-1.5"
    >
      <input type="hidden" name="ticketId" defaultValue={ticketId} />
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        {dict.service.assignTo}
      </label>
      <div className="flex gap-2">
        <select name="assignee" defaultValue={assignee} className="input min-w-0 flex-1">
          <option value="">{dict.service.unassigned}</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className="btn-outline shrink-0">
          {pending ? dict.service.saving : dict.service.save}
        </button>
      </div>
    </ValidatedForm>
  );
}

function EscalateForm({ ticketId }: { ticketId: string }) {
  const dict = useDict();
  const [state, formAction, pending] = useActionState<TicketFormState, FormData>(
    escalateTicketAction,
    null,
  );
  return (
    <ValidatedForm
      action={formAction}
      errors={state?.fieldErrors}
      result={state}
      successMessage="Ticket escalated."
      noValidate
      className="min-w-0 flex-1 space-y-1.5"
    >
      <input type="hidden" name="ticketId" defaultValue={ticketId} />
      <label
        htmlFor={`escalate-${ticketId}`}
        className="block text-[11px] font-semibold uppercase tracking-wider text-muted"
      >
        {dict.service.escalationLabel}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={`escalate-${ticketId}`}
          name="escalationNote"
          maxLength={500}
          placeholder={dict.service.escalationPlaceholder}
          className="input min-w-0 flex-1"
        />
        <button type="submit" disabled={pending} className="btn-outline shrink-0 text-accent">
          {pending ? dict.service.escalating : dict.service.escalate}
        </button>
      </div>
      <p className="text-[11px] text-muted">{dict.service.escalateHint}</p>
    </ValidatedForm>
  );
}
