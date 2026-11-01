"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleStockNotification } from "@backend/actions/notify";
import { useDict } from "@frontend/i18n/provider";
import { useToast } from "@frontend/components/ui/toast";

export function NotifyMeButton({
  productId,
  enabled,
  loggedIn,
}: {
  productId: string;
  enabled: boolean;
  loggedIn: boolean;
}) {
  const dict = useDict();
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  if (!loggedIn) {
    return (
      <Link
        href={`/login?callbackUrl=/products`}
        className="btn-outline btn-lg flex w-full items-center justify-center gap-2"
      >
        <BellIcon />
        {dict.product.notifyMe}
      </Link>
    );
  }

  function toggle() {
    startTransition(async () => {
      const res = await toggleStockNotification(productId);
      if (res.ok) {
        const enabled = res.enabled ?? false;
        setOn(enabled);
        setError(null);
        toast(
          enabled ? "You will be notified when this is back in stock." : "Stock alert removed.",
        );
      } else {
        const message = res.error ?? dict.product.couldNotAdd;
        setError(message);
        toast(message, "error");
      }
    });
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`btn-lg flex w-full items-center justify-center gap-2 ${on ? "btn-outline border-primary text-primary" : "btn-outline"}`}
      >
        <BellIcon />
        {pending ? "…" : on ? dict.product.notifyMeOn : dict.product.notifyMe}
      </button>
      {error && <p className="mt-2 text-sm text-accent">{error}</p>}
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
