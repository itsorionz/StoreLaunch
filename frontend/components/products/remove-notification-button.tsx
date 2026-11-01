"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleStockNotification } from "@backend/actions/notify";
import { useDict } from "@frontend/i18n/provider";
import { useToast } from "@frontend/components/ui/toast";

export function RemoveNotificationButton({ productId }: { productId: string }) {
  const dict = useDict();
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await toggleStockNotification(productId);
              if (!res.ok) {
                toast(res.error ?? "Could not update notification", "error");
                return;
              }
              toast(res.enabled ? "Stock notification enabled" : "Stock notification removed");
              router.refresh();
            })
          }
          className="btn-sm rounded-lg bg-accent px-2.5 py-1 font-semibold text-white"
        >
          {pending ? "…" : "✓"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="btn-sm text-muted hover:text-foreground"
        >
          {dict.common.cancel}
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="btn-sm rounded-lg px-2.5 py-1 font-semibold text-accent hover:bg-accent/10"
    >
      {dict.common.delete}
    </button>
  );
}
