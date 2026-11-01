"use client";

import { logoutAction } from "@backend/actions/auth";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-accent"
      >
        Sign out
      </button>
    </form>
  );
}
