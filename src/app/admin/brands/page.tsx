import Image from "next/image";
import { listBrands } from "@backend/lib/admin-catalog-queries";
import { DeleteBrandButton } from "@frontend/components/admin/delete-buttons";
import { AddBrandModal, EditBrandModal } from "@frontend/components/admin/entity-modals";
import { PageHeader } from "@frontend/components/admin/admin-ui";

export const metadata = { title: "Brands — Admin" };

export default async function AdminBrandsPage() {
  const brands = await listBrands();

  return (
    <div className="animate-fade-up">
      <PageHeader title="Brands" subtitle={`${brands.length} brands`} action={<AddBrandModal />} />
      <section className="card overflow-hidden">
        <ul className="divide-y divide-border">
          {brands.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-muted">No brands yet.</li>
          )}
          {brands.map((b) => (
            <li
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                {b.imageUrl ? (
                  <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-surface-2">
                    <Image
                      src={b.imageUrl}
                      alt=""
                      fill
                      sizes="36px"
                      className="object-contain p-0.5"
                    />
                  </span>
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-xs font-bold text-muted">
                    {b.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate font-semibold">{b.name}</p>
                  <p className="truncate text-xs text-muted">
                    /{b.slug} · {b._count.products} products
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <EditBrandModal
                  brand={{
                    id: b.id,
                    name: b.name,
                    nameBn: b.nameBn,
                    slug: b.slug,
                    imageUrl: b.imageUrl,
                  }}
                />
                <DeleteBrandButton id={b.id} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
