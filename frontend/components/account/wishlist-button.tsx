"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleWishlist } from "@backend/actions/wishlist";
import { useToast } from "@frontend/components/ui/toast";

export function WishlistButton({
  productId,
  initial,
  size = "lg",
}: {
  productId: string;
  initial: boolean;
  size?: "lg" | "sm";
}) {
  const [on, setOn] = useState(initial);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const toast = useToast();

  async function handleClick() {
    if (pending) return;
    setPending(true);
    const res = await toggleWishlist(productId);
    setPending(false);
    if (!res.ok) {
      toast(res.error ?? "Could not update wishlist", "error");
      if (res.error === "Sign in to save items")
        router.push(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setOn(res.on ?? false);
    toast(res.on ? "Added to wishlist" : "Removed from wishlist");
    router.refresh();
  }

  const dims = size === "lg" ? "h-11 w-11" : "h-8 w-8";

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={on}
        aria-label="wishlist"
        disabled={pending}
        className={`flex ${dims} items-center justify-center rounded-full border border-border bg-card transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-60 ${
          on ? "text-accent" : "text-muted"
        }`}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill={on ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
      </button>
    </span>
  );
}
