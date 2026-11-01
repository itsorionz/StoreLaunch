"use client";

import { useActionState, useState } from "react";
import { AfterSalesKinds } from "@backend/lib/enums.mjs";
import { submitAfterSales } from "@backend/actions/after-sales";
import { formatPrice } from "@backend/lib/money";
import { ValidatedForm, ValidationTextarea } from "@frontend/components/ui/validated-form";

type Item = { id: string; name: string; quantity: number; priceCents: number };

const reasonChips = [
  "Damaged or broken",
  "Wrong item received",
  "Quality not as described",
  "Missing or incomplete items",
  "Changed my mind",
];

export function AfterSalesRequestForm({
  orderId,
  items,
  cancellationAllowed,
  returnAllowed,
  currencySymbol,
  activeRequest,
  returnWindowClosedOn,
}: {
  orderId: string;
  items: Item[];
  cancellationAllowed: boolean;
  returnAllowed: boolean;
  currencySymbol: string;
  activeRequest?: boolean;
  returnWindowClosedOn?: string | null;
}) {
  const [state, action, pending] = useActionState(submitAfterSales, null);
  const defaultKind = cancellationAllowed ? AfterSalesKinds.Cancellation : AfterSalesKinds.Return;
  const [kind, setKind] = useState<string>(defaultKind);
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((item) => [item.id, 0])),
  );
  const [reason, setReason] = useState("");

  const kindOptions: { value: string; label: string; hint: string }[] = [];
  if (cancellationAllowed)
    kindOptions.push({
      value: AfterSalesKinds.Cancellation,
      label: "Cancel order",
      hint: "Available before dispatch",
    });
  if (returnAllowed) {
    kindOptions.push({
      value: AfterSalesKinds.Return,
      label: "Return items",
      hint: "Money back after inspection",
    });
    kindOptions.push({
      value: AfterSalesKinds.Replacement,
      label: "Replacement",
      hint: "Same item sent again",
    });
  }

  if (state?.ok) {
    return (
      <section
        className="mt-6 rounded-2xl border border-primary/30 bg-primary-light/30 p-5"
        data-after-sales-request
        data-after-sales-submitted
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white"
          >
            ✓
          </span>
          <div>
            <h2 className="font-bold">Request submitted</h2>
            <p className="mt-1 text-sm text-muted">
              The store will review it. You get a notification at every step, and progress is shown
              under your return and replacement requests on this page.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (activeRequest) return null;

  if (!cancellationAllowed && !returnAllowed) {
    if (!returnWindowClosedOn) return null;
    const closedOn = new Date(returnWindowClosedOn).toLocaleDateString("en-GB", {
      timeZone: "Asia/Dhaka",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return (
      <section
        className="mt-6 rounded-2xl border border-border bg-surface p-5 text-sm"
        data-after-sales-request
      >
        <h2 className="font-bold">Returns and replacements</h2>
        <p className="mt-1 text-muted">
          The return window for this order closed on {closedOn}. Contact store support if your item
          is faulty or arrived damaged.
        </p>
      </section>
    );
  }

  const heading = cancellationAllowed
    ? returnAllowed
      ? "Cancellation, return or replacement"
      : "Cancel this order"
    : "Return or replacement";
  const showItems = returnAllowed && kind !== AfterSalesKinds.Cancellation;
  const selected = items.filter((item) => (quantities[item.id] ?? 0) > 0);
  const units = selected.reduce((sum, item) => sum + (quantities[item.id] ?? 0), 0);
  const valueCents = selected.reduce(
    (sum, item) => sum + item.priceCents * (quantities[item.id] ?? 0),
    0,
  );
  const allSelected =
    items.length > 0 && items.every((item) => (quantities[item.id] ?? 0) >= item.quantity);
  const reasonTooShort = reason.trim().length < 5;
  const needsItems = showItems && selected.length === 0;

  const setQuantity = (item: Item, next: number) =>
    setQuantities((current) => ({
      ...current,
      [item.id]: Math.max(0, Math.min(item.quantity, Number.isFinite(next) ? next : 0)),
    }));

  return (
    <section
      className="mt-6 rounded-2xl border border-border bg-surface p-5"
      data-after-sales-request
    >
      <h2 className="font-bold">{heading}</h2>
      <p className="mt-1 text-sm text-muted">
        {cancellationAllowed
          ? "Requests are reviewed by the store. Cancelled orders are refunded in the original tender."
          : "Returned items are inspected before any refund or stock change. You will be notified at every step."}
      </p>
      <ValidatedForm
        action={action}
        errors={state?.fieldErrors}
        result={state}
        successMessage="Request submitted."
        noValidate
        className="mt-4 space-y-4"
      >
        <input type="hidden" name="orderId" value={orderId} />
        <fieldset>
          <legend className="text-sm font-medium">Request type</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {kindOptions.map((option) => {
              const selectedKind = kind === option.value;
              return (
                <label
                  key={option.value}
                  className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                    selectedKind
                      ? "border-primary bg-primary-light/40 ring-1 ring-primary"
                      : "border-border bg-card hover:border-primary/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="kind"
                    value={option.value}
                    checked={selectedKind}
                    onChange={() => setKind(option.value)}
                    className="sr-only"
                  />
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="mt-0.5 block text-xs text-muted">{option.hint}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {showItems && (
          <div
            role="group"
            aria-label={`Items to ${kind === AfterSalesKinds.Replacement ? "replace" : "return"}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">
                Items to {kind === AfterSalesKinds.Replacement ? "replace" : "return"}
              </p>
              <button
                type="button"
                onClick={() =>
                  setQuantities(
                    Object.fromEntries(
                      items.map((item) => [item.id, allSelected ? 0 : item.quantity]),
                    ),
                  )
                }
                className="text-xs font-semibold text-primary hover:underline"
              >
                {allSelected ? "Clear selection" : "Select all items"}
              </button>
            </div>
            <ul className="mt-2 space-y-2">
              {items.map((item) => {
                const quantity = quantities[item.id] ?? 0;
                return (
                  <li
                    key={item.id}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                      quantity > 0
                        ? "border-primary/40 bg-primary-light/20"
                        : "border-border bg-card"
                    }`}
                  >
                    {quantity > 0 && (
                      <input type="hidden" name={`item:${item.id}`} value={quantity} />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted">
                        Ordered {item.quantity} · {formatPrice(item.priceCents, currencySymbol)}{" "}
                        each
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Remove one ${item.name}`}
                        onClick={() => setQuantity(item, quantity - 1)}
                        disabled={quantity === 0}
                        className="h-9 w-9 rounded-lg border border-border bg-card text-lg leading-none text-foreground hover:border-primary hover:text-primary disabled:opacity-40"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={item.quantity}
                        value={quantity}
                        aria-label={`Quantity of ${item.name}`}
                        onChange={(event) =>
                          setQuantity(item, Number.parseInt(event.target.value, 10))
                        }
                        className="input h-9 w-14 px-1 text-center"
                      />
                      <button
                        type="button"
                        aria-label={`Add one ${item.name}`}
                        onClick={() => setQuantity(item, quantity + 1)}
                        disabled={quantity >= item.quantity}
                        className="h-9 w-9 rounded-lg border border-border bg-card text-lg leading-none text-foreground hover:border-primary hover:text-primary disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-muted" data-after-sales-summary>
              {units} unit{units === 1 ? "" : "s"} from {selected.length} item
              {selected.length === 1 ? "" : "s"}
              {selected.length > 0 &&
                ` · estimated ${kind === AfterSalesKinds.Replacement ? "value" : "refund"} ${formatPrice(valueCents, currencySymbol)}`}
              {needsItems && " · select at least one item to continue"}
            </p>
            {state?.fieldErrors?.items?.[0] && (
              <p role="alert" className="mt-1 text-xs text-accent" data-field-error="items">
                {state.fieldErrors.items[0]}
              </p>
            )}
          </div>
        )}

        <div>
          <p className="text-sm font-medium">Reason</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {reasonChips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setReason(chip)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  reason === chip
                    ? "border-primary bg-primary-light text-primary"
                    : "border-border bg-card text-muted hover:border-primary/50 hover:text-primary"
                }`}
              >
                {chip}
              </button>
            ))}
          </div>
          <ValidationTextarea
            name="reason"
            className="input mt-2"
            placeholder="Describe why you are requesting this"
            rows={2}
            maxLength={300}
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          {reasonTooShort && (
            <p className="mt-1 text-xs text-muted">Add a short reason (at least 5 characters).</p>
          )}
        </div>

        <label className="block text-sm font-medium">
          Additional details (optional)
          <ValidationTextarea
            name="note"
            className="input mt-1"
            placeholder="Add delivery, condition or preferred resolution details"
            rows={2}
            maxLength={1000}
          />
        </label>

        {state?.error && (
          <p role="alert" className="text-sm text-accent">
            {state.error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn-primary"
            disabled={pending || reasonTooShort || needsItems}
            aria-busy={pending || undefined}
          >
            {pending ? "Submitting..." : "Submit request"}
          </button>
          <span className="text-xs text-muted">
            Reviewed by the store before any refund, return pickup or replacement.
          </span>
        </div>
      </ValidatedForm>
    </section>
  );
}
