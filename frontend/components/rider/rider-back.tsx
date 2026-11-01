"use client";

import { useRouter } from "next/navigation";

export function RiderBack({ label = "Back" }: { label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="text-sm font-semibold text-muted transition-colors hover:text-ink"
    >
      ← {label}
    </button>
  );
}
