"use client";

import { useActionState, useState } from "react";
import { ValidatedForm, ValidationInput } from "@frontend/components/ui/validated-form";
import { issueLicenseAction } from "@backend/actions/license";

export function IssueLicenseForm() {
  const [result, action, pending] = useActionState<
    { ok: boolean; key?: string; error?: string } | null,
    FormData
  >((_state, formData) => issueLicenseAction(formData), null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  return (
    <section className="card p-5 sm:p-6" aria-label="Issue new license key">
      <h2 className="font-bold">Issue new license key</h2>
      <p className="mt-1 text-xs text-muted">
        Generate a license key to share with an Admin user. They activate it on their instance to
        unlock /admin.
      </p>
      {result?.ok && result.key && (
        <div className="mt-4 rounded-xl border border-border bg-surface-2 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-muted">Issued key</span>
              <span className="font-mono text-sm text-foreground">{result.key}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(result.key ?? "");
                setCopiedKey(result.key ?? "");
              }}
              disabled={copiedKey === result.key}
              className="btn-outline btn-sm"
            >
              {copiedKey === result.key ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Share this key with the Admin user. They enter it at /admin/license to activate.
          </p>
        </div>
      )}
      {result && !result.ok && result.error && (
        <p
          role="alert"
          className="rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent mt-4"
        >
          {result.error}
        </p>
      )}
      <ValidatedForm
        result={result}
        noValidate
        action={action}
        className="space-y-4 mt-4"
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Label (optional)</span>
          <ValidationInput
            type="text"
            name="label"
            placeholder="e.g. East Dhaka store"
            className="input w-full max-w-lg"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Bound store (optional)</span>
          <ValidationInput
            type="text"
            name="storeSlug"
            placeholder="e.g. east-dhaka-store"
            className="input w-full max-w-lg"
          />
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            name="isTrial"
            className="mt-0.5"
          />
          <span className="text-sm text-muted">
            Trial key (7 days)&nbsp;
            <span className="text-xs text-accent">auto-expires after 7 days</span>
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Expires in (days, optional)</span>
          <ValidationInput
            type="number"
            name="expiresInDays"
            placeholder="Leave blank for never"
            className="input w-full max-w-lg"
          />
        </label>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Issuing…" : "Issue license key"}
        </button>
      </ValidatedForm>
    </section>
  );
}
