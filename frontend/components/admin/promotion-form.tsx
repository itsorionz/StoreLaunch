"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PromotionAudiences } from "@backend/lib/enums.mjs";
import {
  savePromotion,
  sendPromotion,
  findPromotionCustomers,
  type PromotionActionResult,
} from "@backend/actions/promotions";
import {
  ValidatedForm,
  ValidationInput,
  ValidationSelect,
  ValidationTextarea,
  FieldError,
} from "../ui/validated-form";
import { useToast } from "../ui/toast";
import { useConfirm } from "../ui/confirm-dialog";

type Customer = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  active?: boolean;
};
type Draft = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  campaignId: string | null;
  audience: (typeof PromotionAudiences)[keyof typeof PromotionAudiences];
};

export function PromotionForm({
  draft,
  campaigns,
  selectedCustomers = [],
  activeCustomerCount,
}: {
  draft?: Draft;
  campaigns: { id: string; title: string; active: boolean }[];
  selectedCustomers?: Customer[];
  activeCustomerCount: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(draft?.title ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [campaignId, setCampaignId] = useState(draft?.campaignId ?? "");
  const [audience, setAudience] = useState(draft?.audience ?? PromotionAudiences.AllCustomers);
  const [selected, setSelected] = useState<Customer[]>(selectedCustomers);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [searchError, setSearchError] = useState("");
  const [searching, search] = useTransition();
  const [state, action, pending] = useActionState<PromotionActionResult, FormData>(
    async (previous, data) => {
      const result = await savePromotion(previous, data);
      if (result?.ok && result.id) {
        toast("Promotion draft saved");
        if (!draft) router.push(`/admin/promotions/${result.id}`);
        else router.refresh();
      }
      return result;
    },
    null,
  );
  const lookup = () =>
    search(async () => {
      const found = await findPromotionCustomers(query);
      setResults(found.customers);
      setSearchError(found.error ?? "");
    });
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
      <ValidatedForm
        action={action}
        errors={state?.fieldErrors}
        result={state}
        successToast={false}
        noValidate
        onReset={(event) => event.preventDefault()}
        className="card space-y-5 p-5"
      >
        {draft && <input type="hidden" name="id" value={draft.id} />}
        {state?.error && !state.fieldErrors && (
          <p role="alert" className="text-sm text-accent">
            {state.error}
          </p>
        )}
        <label className="block text-sm font-medium">
          Promotion title
          <ValidationInput
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={100}
            required
            className="input mt-1"
            placeholder="e.g. Weekend spice offers"
          />
        </label>
        <label className="block text-sm font-medium">
          Message
          <ValidationTextarea
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={5}
            maxLength={2000}
            required
            className="input mt-1"
            placeholder="Describe the offer, eligibility and any terms customers should know."
          />
        </label>
        <label className="block text-sm font-medium">
          Link to an offer collection (optional)
          <ValidationSelect
            name="campaignId"
            value={campaignId}
            onChange={(event) => setCampaignId(event.target.value)}
            className="input mt-1"
          >
            <option value="">No linked campaign</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.title}
                {campaign.active ? "" : " (Inactive - activate before sending)"}
              </option>
            ))}
          </ValidationSelect>
        </label>
        {!campaignId && (
          <label className="block text-sm font-medium">
            Custom destination (optional)
            <ValidationInput
              name="href"
              defaultValue={draft?.campaignId ? "" : (draft?.href ?? "")}
              className="input mt-1"
              placeholder="/offers or https://..."
            />
          </label>
        )}
        <label className="block text-sm font-medium">
          Send to
          <ValidationSelect
            name="audience"
            value={audience}
            onChange={(event) => setAudience(event.target.value as typeof audience)}
            className="input mt-1"
          >
            <option value={PromotionAudiences.AllCustomers}>
              All active customers ({activeCustomerCount})
            </option>
            <option value={PromotionAudiences.SelectedCustomers}>Selected customers</option>
          </ValidationSelect>
        </label>
        {audience === PromotionAudiences.SelectedCustomers && (
          <div className="space-y-3 rounded-xl border border-border p-3">
            <p className="text-sm font-semibold">Selected customers ({selected.length})</p>
            {selected.map((customer) => (
              <div
                key={customer.id}
                className="flex items-center gap-2 rounded bg-surface-2 p-2 text-xs"
              >
                <input type="hidden" name="selectedUserIds" value={customer.id} />
                <span className="min-w-0 flex-1 break-words">
                  {customer.name || customer.email || customer.phone}
                  {customer.active === false ? " (Inactive)" : ""}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${customer.name || customer.email}`}
                  onClick={() =>
                    setSelected((previous) => previous.filter((user) => user.id !== customer.id))
                  }
                  className="btn-icon"
                >
                  ×
                </button>
              </div>
            ))}
            <FieldError name="selectedUserIds" />
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    lookup();
                  }
                }}
                className="input min-w-0 flex-1"
                placeholder="Name, email or phone"
                maxLength={200}
                aria-label="Find customers"
              />
              <button type="button" onClick={lookup} disabled={searching} className="btn-outline">
                {searching ? "Searching..." : "Find customers"}
              </button>
            </div>
            {searchError && (
              <p role="alert" className="text-xs text-accent">
                {searchError}
              </p>
            )}
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {results.map((customer) => (
                <label
                  key={customer.id}
                  className="flex gap-2 rounded p-2 text-xs hover:bg-surface-2"
                >
                  <input
                    type="checkbox"
                    checked={selected.some((user) => user.id === customer.id)}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setSelected((previous) =>
                        checked
                          ? [...previous.filter((user) => user.id !== customer.id), customer]
                          : previous.filter((user) => user.id !== customer.id),
                      );
                    }}
                    className="accent-[var(--primary)]"
                  />
                  <span className="break-words">
                    {customer.name}
                    <span className="block text-muted">{customer.email || customer.phone}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted">
              Search shows up to 30 active customer accounts. Refine your search to find more.
            </p>
          </div>
        )}
        <p className="text-xs leading-5 text-muted">
          Channel: customer Promotion inbox. Saving creates a draft; sending happens on the review
          screen. All customers means active customer accounts at send time. This does not send SMS
          or email.
        </p>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Saving..." : "Save draft & review"}
        </button>
      </ValidatedForm>
      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Customer preview</h2>
        <article className="rounded-xl border-l-4 border-primary bg-primary/5 p-4">
          <p className="text-xs font-semibold text-primary">Promotion · Unread</p>
          <h3 className="mt-2 break-words font-bold">{title || "Your promotion title"}</h3>
          <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-muted">
            {body || "Your message will appear here."}
          </p>
          <span className="mt-3 inline-block rounded-lg border border-primary px-3 py-2 text-xs font-medium text-primary">
            {campaignId ? "View offer collection" : "Promotion"}
          </span>
        </article>
        <Link href="/admin/campaigns" className="text-sm text-primary underline">
          Manage offer collections & discounts
        </Link>
      </section>
    </div>
  );
}

export function SendPromotionButton({
  id,
  recipientCount,
}: {
  id: string;
  recipientCount: number;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const router = useRouter();
  const [state, setState] = useState<PromotionActionResult>(null);
  const [pending, startTransition] = useTransition();
  const send = async () => {
    const approved = await confirm({
      title: "Send promotion?",
      description: `Deliver this saved promotion to ${recipientCount} active customer inboxes? Sent messages cannot be edited.`,
      confirmLabel: "Send promotion",
      danger: false,
    });
    if (!approved) return;
    startTransition(async () => {
      const data = new FormData();
      data.set("id", id);
      const result = await sendPromotion(null, data);
      setState(result);
      if (result?.ok) {
        toast(
          result.alreadySent
            ? "This promotion has already been sent"
            : `Promotion sent to ${result.count} customers`,
        );
        router.refresh();
      }
    });
  };
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={send}
        disabled={pending || !recipientCount}
        className="btn-primary"
      >
        {pending ? "Sending..." : `Send promotion (${recipientCount})`}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm text-accent">
          {state.error}
        </p>
      )}
    </div>
  );
}
