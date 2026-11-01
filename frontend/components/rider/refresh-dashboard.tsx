"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function RefreshDashboard() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn-outline"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {pending ? "Refreshing…" : "Refresh dashboard"}
    </button>
  );
}
