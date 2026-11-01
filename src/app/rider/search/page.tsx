import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getRider } from "@backend/lib/session";
import { appSearchSchema } from "@backend/lib/search-filters";
import { searchRider } from "@backend/lib/app-search";
import { AppSearchResults } from "@frontend/components/layout/app-search-results";
import { SearchRoutes } from "@backend/lib/search-config.mjs";

async function RiderSearch({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const context = await getRider();
  if (!context) redirect(`/login?callbackUrl=${SearchRoutes.rider}`);
  const parsed = appSearchSchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data.q : "";
  return (
    <AppSearchResults
      query={query}
      invalid={!parsed.success}
      groups={query ? await searchRider(context.rider.id, query) : []}
    />
  );
}
export default function RiderSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  return (
    <Suspense fallback={<div className="skeleton h-48 w-full rounded-xl" />}>
      <RiderSearch searchParams={searchParams} />
    </Suspense>
  );
}
