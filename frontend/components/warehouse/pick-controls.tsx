"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { markPicked, pickItem, type AdminActionResult } from "@backend/actions/admin";
import { ActionResultToast } from "@frontend/components/ui/validated-form";

const EMPTY: AdminActionResult | null = null;

export function PickLineForm({
  pickListId,
  orderItemId,
  qtyOrdered,
  lineLocked,
}: {
  pickListId: string;
  orderItemId: string;
  qtyOrdered: number;
  lineLocked: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<AdminActionResult | null, FormData>(
    async (_prev, formData) => {
      formData.set("pickListId", pickListId);
      formData.set("orderItemId", orderItemId);
      const result = await pickItem(null, formData);
      if (result.ok) router.refresh();
      return result;
    },
    EMPTY,
  );

  // The toast renders in both branches: after a pick the line flips to
  // `lineLocked` on refresh, and the confirmation must still surface.
  if (lineLocked)
    return (
      <>
        <ActionResultToast result={state} successMessage="Pick recorded." />
        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Picked</span>
      </>
    );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <ActionResultToast result={state} successMessage="Pick recorded." />
      <label className="text-xs text-muted">
        Picked
        <input
          name="qtyPicked"
          type="number"
          min={0}
          max={qtyOrdered}
          defaultValue={qtyOrdered}
          className="ml-1 w-16 rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
        />
      </label>
      <label className="text-xs text-muted">
        Short
        <input
          name="shortPickQty"
          type="number"
          min={0}
          defaultValue={0}
          className="ml-1 w-16 rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
        />
      </label>
      <input
        name="shortPickReason"
        placeholder="Short reason"
        className="w-32 rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-primary/90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Pick"}
      </button>
      {state?.error && <span className="text-xs font-semibold text-red-500">{state.error}</span>}
    </form>
  );
}

export function MarkPickedButton({ pickListId }: { pickListId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<AdminActionResult | null, FormData>(
    async () => {
      const formData = new FormData();
      formData.set("pickListId", pickListId);
      const result = await markPicked(null, formData);
      if (result.ok) router.refresh();
      return result;
    },
    EMPTY,
  );
  return (
    <form action={formAction}>
      <ActionResultToast result={state} successMessage="Order marked picked." />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Mark picked"}
      </button>
      {state?.error && <p className="mt-2 text-xs font-semibold text-red-500">{state.error}</p>}
    </form>
  );
}
