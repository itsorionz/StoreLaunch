import { requireServicePage } from "@backend/lib/session";
import { appSearchSchema } from "@backend/lib/search-filters";
import { searchSupport } from "@backend/lib/app-search";
import { AppSearchResults } from "@frontend/components/layout/app-search-results";

export const metadata = { title: "Search — Support" };

export default async function SupportSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireServicePage();
  const parsed = appSearchSchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data.q : "";
  return (
    <AppSearchResults
      query={query}
      invalid={!parsed.success}
      groups={query ? await searchSupport(query) : []}
    />
  );
}
