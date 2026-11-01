"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AccountStatusTargets, EntityStatuses } from "@backend/lib/enums.mjs";
import { updateAccountStatus } from "@backend/actions/account-status";
import { useConfirm } from "@frontend/components/ui/confirm-dialog";
import { useToast } from "@frontend/components/ui/toast";

export function AccountStatusToggle({
  id,
  active,
  target = AccountStatusTargets.User,
  disabled = false,
}: {
  id: string;
  active: boolean;
  target?: string;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  return (
    <div className="max-w-xs">
      <button
        type="button"
        disabled={pending || disabled}
        className="btn-outline btn-sm disabled:opacity-50"
        onClick={async () => {
          if (
            active &&
            !(await confirm({
              title:
                target === AccountStatusTargets.Rider
                  ? "Deactivate this rider?"
                  : "Deactivate this account?",
              description:
                target === AccountStatusTargets.Rider
                  ? "Rider login and new assignments will be blocked. Customer access is unchanged."
                  : "Login and account access will be blocked for every role on this account. Orders and wallet records will be retained.",
              confirmLabel: "Deactivate",
            }))
          )
            return;
          setError(null);
          startTransition(async () => {
            const data = new FormData();
            data.set("id", id);
            data.set("target", target);
            data.set("status", active ? EntityStatuses.Inactive : EntityStatuses.Active);
            data.set("expectedStatus", active ? EntityStatuses.Active : EntityStatuses.Inactive);
            try {
              const result = await updateAccountStatus(null, data);
              if (!result?.ok) {
                const message = result?.error ?? "Could not update status. Refresh and try again.";
                setError(message);
                toast(message, "error");
              } else {
                toast(active ? "Account deactivated." : "Account activated.");
                router.refresh();
              }
            } catch {
              const message = "Could not update status. Please try again.";
              setError(message);
              toast(message, "error");
            }
          });
        }}
      >
        {pending ? "Saving..." : active ? "Deactivate" : "Activate"}
      </button>
      {disabled && <p className="mt-1 text-xs text-muted">Your account</p>}
      {error && (
        <p role="alert" className="mt-1 text-xs text-accent">
          {error}
        </p>
      )}
    </div>
  );
}
