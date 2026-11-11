import Link from "next/link";
import { getCategoryTree, type CategoryTree } from "@backend/lib/catalog";
import { getDict, type Dictionary } from "@frontend/i18n/dict";

function categoryName(node: CategoryTree, lang: Dictionary["lang"]) {
  return lang === "bn" ? node.nameBn || node.name : node.name;
}

export default async function CategoriesPage() {
  const [tree, dict] = await Promise.all([getCategoryTree(), getDict()]);

  return (
    <div className="w-full px-4 py-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-bold">All categories</h1>
          <p className="text-sm text-muted">{tree.length} categories</p>
        </div>

        {tree.length === 0 ? (
          <div className="card flex flex-col items-center py-20 text-center">
            <p className="font-semibold">No categories yet</p>
            <p className="mt-1 text-sm text-muted">
              Categories will show up here as soon as they are added to the store.
            </p>
            <Link href="/" className="btn-outline mt-5">
              Back to home
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {tree.map((c) => (
              <div
                key={c.id}
                className="flex flex-col rounded-xl border border-border/60 bg-surface p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <Link href={`/categories/${c.slug}`} className="block text-center">
                  <span className="relative mb-3 flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-surface-2">
                    <img
                      src={c.imageUrl ?? "/categories/photo-spices.webp"}
                      alt={categoryName(c, dict.lang)}
                      className="h-full w-full object-contain p-2"
                    />
                  </span>
                  <span className="block text-sm font-semibold leading-tight">
                    {categoryName(c, dict.lang)}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {c.productCount} {c.productCount === 1 ? "product" : "products"}
                  </span>
                </Link>

                {c.children.length > 0 && (
                  <div className="mt-3 flex flex-wrap justify-center gap-1.5 border-t border-border/50 pt-3">
                    {c.children.map((child) => (
                      <Link
                        key={child.id}
                        href={`/categories/${child.slug}`}
                        className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-foreground/70 transition-colors hover:bg-primary-light hover:text-primary"
                      >
                        {categoryName(child, dict.lang)}
                        <span className="ml-1 text-muted">({child.productCount})</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export async function generateMetadata() {
  return { title: "Categories" };
}
