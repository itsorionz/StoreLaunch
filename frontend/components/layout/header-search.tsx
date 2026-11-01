"use client";
import { SearchLimits, SearchRoutes } from "@backend/lib/search-config.mjs";

import { usePathname, useSearchParams } from "next/navigation";

type Labels = { search: string; placeholder: string };
export function HeaderSearch({ search, placeholder }: Labels) {
  const params = useSearchParams();
  const pathname = usePathname();
  return (
    <HeaderSearchForm
      key={`${pathname}:${params.get("q") ?? ""}`}
      search={search}
      placeholder={placeholder}
      query={params.get("q") ?? ""}
    />
  );
}

export function HeaderSearchForm({ search, placeholder, query = "" }: Labels & { query?: string }) {
  return (
    <form
      role="search"
      action={SearchRoutes.products}
      method="get"
      className="order-3 flex h-11 w-full items-center rounded-xl border border-border bg-surface transition-colors focus-within:border-primary sm:order-2 sm:flex-1"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="pointer-events-none ml-3 shrink-0 text-muted"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="search"
        name="q"
        aria-label={search}
        placeholder={placeholder}
        defaultValue={query}
        maxLength={SearchLimits.queryLength}
        className="w-full min-w-0 border-0 bg-transparent py-2 pl-2 pr-3 text-sm text-foreground placeholder:text-muted focus:outline-none"
      />
      <button
        type="submit"
        className="h-11 w-[88px] shrink-0 rounded-r-[10px] bg-primary text-sm font-medium text-white transition-colors hover:bg-primary-dark"
      >
        {search}
      </button>
    </form>
  );
}
