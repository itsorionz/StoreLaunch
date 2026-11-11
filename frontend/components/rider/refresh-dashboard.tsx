"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@frontend/components/ui/toast";

export function RefreshDashboard() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn-outline"
      disabled={pending}
      onClick={() =>
        startTransition(() => {
          router.refresh();
          toast("Dashboard refreshed.");
        })
      }
    >
      {pending ? "Refreshing…" : "Refresh dashboard"}
    </button>
  );
}
