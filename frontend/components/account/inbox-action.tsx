"use client";

import { InboxCategories } from "@backend/lib/enums.mjs";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { updateInbox, type InboxActionResult } from "@backend/actions/inbox";
import { useDict } from "@frontend/i18n/provider";
import { ActionResultToast } from "@frontend/components/ui/validated-form";

export function InboxAction({
  id,
  read,
  category,
  href,
  children,
  disabled = false,
}: {
  id?: string;
  read?: boolean;
  category?: typeof InboxCategories.PROMOTION | typeof InboxCategories.NOTIFICATION;
  href?: string | null;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const dict = useDict();
  const router = useRouter();
  const [state, action, pending] = useActionState<InboxActionResult, FormData>(
    async (previous, data) => {
      const result = await updateInbox(previous, data);
      if (result?.ok && href) {
        if (href.startsWith("/") && !href.startsWith("//") && !href.includes("\\"))
          router.push(href);
        else if (/^https?:\/\//i.test(href)) window.location.assign(href);
      }
      return result;
    },
    null,
  );
  return (
    <>
      <ActionResultToast result={state} successMessage={dict.inbox.saved} />
      <form action={action} className="space-y-1">
        <input type="hidden" name="operation" value={id ? "single" : "all"} />
        {id ? (
          <>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="read" value={String(read)} />
          </>
        ) : (
          <input type="hidden" name="category" value={category} />
        )}
        <button
          type="submit"
          disabled={disabled || pending}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? dict.inbox.working : children}
        </button>
        {state?.error && (
          <p role="alert" className="text-xs text-accent">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <span role="status" className="sr-only">
            {dict.inbox.saved}
          </span>
        )}
      </form>
    </>
  );
}
