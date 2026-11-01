"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { confirmPackLine, markPacked, type AdminActionResult } from "@backend/actions/admin";

const EMPTY: AdminActionResult | null = null;

export function ConfirmPackLineButton({
  pickListId,
  orderItemId,
}: {
  pickListId: string;
  orderItemId: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<AdminActionResult | null, FormData>(
    async () => {
      const formData = new FormData();
      formData.set("pickListId", pickListId);
      formData.set("orderItemId", orderItemId);
      const result = await confirmPackLine(null, formData);
      if (result.ok) router.refresh();
      return result;
    },
    EMPTY,
  );
  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-surface-2 disabled:opacity-50"
      >
        {pending ? "…" : "Confirm"}
      </button>
      {state?.error && (
        <span className="ml-2 text-xs font-semibold text-red-500">{state.error}</span>
      )}
    </form>
  );
}

export function MarkPackedButton({ pickListId }: { pickListId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<AdminActionResult | null, FormData>(
    async () => {
      const formData = new FormData();
      formData.set("pickListId", pickListId);
      const result = await markPacked(null, formData);
      if (result.ok) router.refresh();
      return result;
    },
    EMPTY,
  );
  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Mark packed"}
      </button>
      {state?.error && <p className="mt-2 text-xs font-semibold text-red-500">{state.error}</p>}
    </form>
  );
}
