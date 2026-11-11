"use client";

import { useState, useActionState, type FormEvent } from "react";
import { useDict } from "@frontend/i18n/provider";
import {
  ValidatedForm,
  ValidationInput,
  ValidationTextarea,
} from "@frontend/components/ui/validated-form";
import {
  createTicketAction,
  searchSupportCustomers,
  type TicketFormState,
} from "@backend/actions/support-tickets";

type Customer = { id: string; name: string; email: string; phone: string | null };

export type TicketPrefill = {
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  orderId?: string;
  conversationId?: string;
  subject?: string;
  body?: string;
};

const categoryLabels: Record<string, string> = {
  OrderStatus: "Order status",
  Payment: "Payment",
  Refund: "Refund",
  Return: "Return",
  Delivery: "Delivery",
  Account: "Account",
  Product: "Product",
  Other: "Other",
};

// New-ticket form. The customer comes from context (order / customer 360 /
// conversation) or is found through the built-in picker; the linked order and
// conversation travel along as hidden fields.
export function TicketNewForm({ prefill }: { prefill: TicketPrefill }) {
  const dict = useDict();
  const [state, formAction, pending] = useActionState<TicketFormState, FormData>(
    createTicketAction,
    null,
  );
  const [customer, setCustomer] = useState<Customer | null>(
    prefill.customerId
      ? {
          id: prefill.customerId,
          name: prefill.customerName ?? "",
          email: prefill.customerEmail ?? "",
          phone: null,
        }
      : null,
  );

  return (
    <ValidatedForm
      action={formAction}
      errors={state?.fieldErrors}
      result={state}
      successMessage="Ticket created."
      noValidate
      className="space-y-4"
    >
      <input type="hidden" name="customerId" value={customer?.id ?? ""} />
      {prefill.orderId && <input type="hidden" name="orderId" value={prefill.orderId} />}
      {prefill.conversationId && (
        <input type="hidden" name="conversationId" value={prefill.conversationId} />
      )}

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-foreground">{dict.service.customer}</label>
        {customer ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{customer.name}</p>
              <p className="truncate text-xs text-muted">{customer.email}</p>
            </div>
            {!prefill.customerId && (
              <button
                type="button"
                onClick={() => setCustomer(null)}
                className="btn-ghost shrink-0 text-xs"
              >
                {dict.service.changeCustomer}
              </button>
            )}
          </div>
        ) : (
          <CustomerPicker onPick={setCustomer} />
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="ticket-subject" className="text-xs font-semibold text-foreground">
          {dict.service.subjectLabel}
        </label>
        <ValidationInput
          id="ticket-subject"
          name="subject"
          maxLength={120}
          defaultValue={prefill.subject ?? ""}
          className="input"
          placeholder={dict.service.subjectPlaceholder}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="ticket-body" className="text-xs font-semibold text-foreground">
          {dict.service.descriptionLabel}
        </label>
        <ValidationTextarea
          id="ticket-body"
          name="body"
          rows={5}
          maxLength={2000}
          defaultValue={prefill.body ?? ""}
          className="input resize-y"
          placeholder={dict.service.descriptionPlaceholder}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="ticket-category" className="text-xs font-semibold text-foreground">
            {dict.service.categoryLabel}
          </label>
          <select id="ticket-category" name="category" defaultValue="Other" className="input">
            {Object.entries(categoryLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="ticket-priority" className="text-xs font-semibold text-foreground">
            {dict.service.priorityLabel}
          </label>
          <select id="ticket-priority" name="priority" defaultValue="Normal" className="input">
            <option value="Low">Low</option>
            <option value="Normal">Normal</option>
            <option value="High">High</option>
            <option value="Urgent">Urgent</option>
          </select>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? dict.service.creatingTicket : dict.service.createTicket}
        </button>
      </div>
    </ValidatedForm>
  );
}

function CustomerPicker({ onPick }: { onPick: (customer: Customer) => void }) {
  const dict = useDict();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[] | null>(null);
  const [pending, setPending] = useState(false);

  async function runSearch(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setPending(true);
    try {
      setResults(await searchSupportCustomers(query));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={120}
          placeholder={dict.service.chooseCustomerPlaceholder}
          className="input min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={pending || query.trim().length < 2}
          className="btn-outline shrink-0"
        >
          {pending ? dict.service.searching : dict.common.search}
        </button>
      </div>
      {results && results.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted">
          {dict.service.noCustomers}
        </p>
      )}
      {results && results.length > 0 && (
        <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border p-1">
          {results.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onPick(row)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{row.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {row.email}
                    {row.phone ? ` · ${row.phone}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-primary">
                  {dict.service.select}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
