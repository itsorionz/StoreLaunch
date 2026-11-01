"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function RefreshAdminDashboard() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="btn-outline gap-2"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden
        className={pending ? "animate-spin" : ""}
      >
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6 7a7 7 0 0 1 12-1l2 6M18 17a7 7 0 0 1-12 1l-2-6" />
      </svg>
      {pending ? "Refreshing…" : "Refresh"}
    </button>
  );
}
