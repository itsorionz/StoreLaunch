import { requireAdminPage } from "@backend/lib/session";
import { appSearchSchema } from "@backend/lib/search-filters";
import { searchAdmin } from "@backend/lib/app-search";
import { AppSearchResults } from "@frontend/components/layout/app-search-results";

export const metadata = { title: "Search — Admin" };
export default async function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdminPage();
  const parsed = appSearchSchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data.q : "";
  return (
    <AppSearchResults
      query={query}
      invalid={!parsed.success}
      groups={query ? await searchAdmin(query) : []}
    />
  );
}
