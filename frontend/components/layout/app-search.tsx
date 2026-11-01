"use client";

import { useSearchParams } from "next/navigation";
import { useDict } from "@frontend/i18n/provider";
import { SearchContexts, SearchLimits, SearchRoutes } from "@backend/lib/search-config.mjs";

export function AppSearch({
  context,
}: {
  context: (typeof SearchContexts)[keyof typeof SearchContexts];
}) {
  const params = useSearchParams();
  return (
    <AppSearchForm context={context} key={params.get("q") ?? ""} query={params.get("q") ?? ""} />
  );
}
export function AppSearchForm({
  context,
  query = "",
}: {
  context: (typeof SearchContexts)[keyof typeof SearchContexts];
  query?: string;
}) {
  const dict = useDict();
  const placeholder =
    context === SearchContexts.admin
      ? dict.appSearch.adminPlaceholder
      : context === SearchContexts.rider
        ? dict.appSearch.riderPlaceholder
        : context === SearchContexts.support
          ? dict.appSearch.supportPlaceholder
          : dict.appSearch.ordersPlaceholder;
  return (
    <form
      role="search"
      action={SearchRoutes[context]}
      method="get"
      className="mb-5 flex min-w-0 items-center gap-2 rounded-xl border border-border bg-surface p-2"
    >
      <input
        name="q"
        type="search"
        defaultValue={query}
        maxLength={SearchLimits.queryLength}
        aria-label={placeholder}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-0 bg-transparent px-2 py-2 text-sm outline-none"
      />
      <button type="submit" className="btn-primary shrink-0">
        {dict.common.search}
      </button>
    </form>
  );
}
