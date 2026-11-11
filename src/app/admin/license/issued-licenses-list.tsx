"use client";

import { useEffect, useState } from "react";
import {
  listIssuedLicenses,
  revokeIssuedLicenseAction,
  type IssuedLicenseRow,
} from "@backend/actions/license";
import { useActionState } from "react";

export function IssuedLicensesList() {
  const [licenses, setLicenses] = useState<IssuedLicenseRow[]>([]);
  const [result, action, pending] = useActionState<
    { ok: boolean; error?: string } | null,
    FormData
  >((_state, formData) => revokeIssuedLicenseAction(formData), null);

  useEffect(() => {
    listIssuedLicenses().then(setLicenses);
  }, []);

  useEffect(() => {
    if (result?.ok) {
      listIssuedLicenses().then(setLicenses);
    }
  }, [result]);

  const activeLicenses = licenses.filter((l) => !l.revokedAt);
  const revokedLicenses = licenses.filter((l) => l.revokedAt);

  const formatDate = (d: Date | null) => {
    if (!d) return "Never";
    return d.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" });
  };

  const isExpired = (l: IssuedLicenseRow) => {
    if (!l.expiresAt) return false;
    return new Date(l.expiresAt) < new Date();
  };

  return (
    <section className="card p-5 sm:p-6" aria-label="Issued license keys">
      <h2 className="font-bold">Issued license keys</h2>
      <p className="mt-1 text-xs text-muted">
        Keys issued by Super Admin. Share the key with an Admin user so they can activate it on
        their instance.
      </p>
      {result && !result.ok && result.error && (
        <p
          role="alert"
          className="rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent mb-4"
        >
          {result.error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3">Bound store</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {activeLicenses.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-sm text-muted">
                  No issued license keys yet.
                </td>
              </tr>
            ) : (
              activeLicenses.map((l) => {
                const expired = isExpired(l);
                return (
                  <tr key={l.id}>
                    <td className="px-4 py-3 font-mono text-xs">{l.key}</td>
                    <td className="px-4 py-3">{l.label}</td>
                    <td className="px-4 py-3">{l.storeSlug ?? "—"}</td>
                    <td className="px-4 py-3">{formatDate(l.expiresAt)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          expired
                            ? "bg-accent/10 text-accent"
                            : "bg-emerald-100 text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {expired ? "Expired" : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={action} className="inline" onSubmit={(e) => e.preventDefault()}>
                        <input type="hidden" name="licenseId" value={l.id} />
                        <button
                          type="submit"
                          disabled={pending}
                          className="btn-outline btn-sm text-accent hover:bg-accent/5"
                        >
                          Revoke
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })
            )}
            {revokedLicenses.length > 0 && (
              <tr className="text-muted/50">
                <td colSpan={6} className="px-4 py-3 text-xs">
                  {revokedLicenses.length} revoked key(s)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
