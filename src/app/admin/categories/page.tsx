import { listCategoriesWithCounts } from "@backend/lib/admin-catalog-queries";
import { DeleteCategoryButton } from "@frontend/components/admin/delete-buttons";
import { AddCategoryModal, EditCategoryModal } from "@frontend/components/admin/entity-modals";
import { PageHeader } from "@frontend/components/admin/admin-ui";

export const metadata = { title: "Categories — Admin" };

type Cat = {
  id: string;
  name: string;
  nameBn: string | null;
  slug: string;
  imageUrl: string | null;
  order: number;
  parentId: string | null;
  _count: { products: number };
};

type CatNode = Cat & { children: CatNode[] };

function buildTree(cats: Cat[]): CatNode[] {
  const map = new Map<string, CatNode>();
  for (const c of cats) map.set(c.id, { ...c, children: [] });
  const roots: CatNode[] = [];
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function TreeRow({
  cat,
  depth,
  parentOptions,
}: {
  cat: CatNode;
  depth: number;
  parentOptions: { id: string; name: string; parentId: string | null }[];
}) {
  return (
    <>
      <li
        className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5"
        style={{ paddingLeft: `${1.25 + depth * 1.5}rem` }}
      >
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {depth > 0 && <span className="mr-1.5 text-muted">└</span>}
            {cat.name}
          </p>
          <p className="truncate text-xs text-muted">
            /{cat.slug} · {cat._count.products} products · order {cat.order}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <EditCategoryModal
            category={{
              id: cat.id,
              name: cat.name,
              nameBn: cat.nameBn,
              slug: cat.slug,
              imageUrl: cat.imageUrl,
              order: cat.order,
              parentId: cat.parentId,
            }}
            parentOptions={parentOptions}
          />
          <DeleteCategoryButton id={cat.id} />
        </div>
      </li>
      {cat.children.map((child) => (
        <TreeRow key={child.id} cat={child} depth={depth + 1} parentOptions={parentOptions} />
      ))}
    </>
  );
}

export default async function AdminCategoriesPage() {
  const categories = await listCategoriesWithCounts();

  const tree = buildTree(categories);
  const parentOptions = categories.map((c) => ({
    id: c.id,
    name: c.name,
    nameBn: c.nameBn,
    parentId: c.parentId,
  }));

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Categories"
        subtitle={`${categories.length} categories`}
        action={<AddCategoryModal parentOptions={parentOptions} />}
      />
      <section className="card overflow-hidden">
        <ul className="divide-y divide-border">
          {categories.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-muted">No categories yet.</li>
          )}
          {tree.map((cat) => (
            <TreeRow key={cat.id} cat={cat} depth={0} parentOptions={parentOptions} />
          ))}
        </ul>
      </section>
    </div>
  );
}
