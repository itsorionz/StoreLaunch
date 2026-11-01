import Link from "next/link";
import { getDict } from "@frontend/i18n/dict";
import { SearchKinds } from "@backend/lib/search-config.mjs";

export async function AppSearchResults({
  query,
  groups,
  invalid = false,
}: {
  query: string;
  invalid?: boolean;
  groups: Array<{
    kind: (typeof SearchKinds)[keyof typeof SearchKinds];
    rows: Array<{ id: string; title: string; detail: string; href: string }>;
  }>;
}) {
  const dict = await getDict();
  return (
    <div className="space-y-5">
      <h1 className="break-words text-2xl font-bold">
        {dict.appSearch.title}
        {query ? `: ${query}` : ""}
      </h1>
      {invalid ? (
        <p role="alert" className="text-sm text-accent">
          {dict.appSearch.invalid}
        </p>
      ) : !query ? (
        <p className="text-sm text-muted">{dict.appSearch.start}</p>
      ) : !groups.some((group) => group.rows.length) ? (
        <p className="card p-8 text-sm text-muted">{dict.appSearch.empty}</p>
      ) : (
        <>
          <p className="text-xs text-muted">{dict.appSearch.limit}</p>
          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            {groups
              .filter((group) => group.rows.length)
              .map((group) => (
                <section
                  key={group.kind}
                  className="card min-w-0 overflow-hidden"
                  data-search-kind={group.kind}
                >
                  <h2 className="border-b border-border p-4 font-semibold">
                    {dict.appSearch[group.kind]}{" "}
                    <span className="text-xs text-muted">({group.rows.length})</span>
                  </h2>
                  <ul className="divide-y divide-border">
                    {group.rows.map((row) => (
                      <li key={row.id}>
                        <Link href={row.href} className="block p-4 hover:bg-surface-2">
                          <p className="break-words text-sm font-semibold">{row.title}</p>
                          <p className="mt-1 break-words text-xs text-muted">{row.detail}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
