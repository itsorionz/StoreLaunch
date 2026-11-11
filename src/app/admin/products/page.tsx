import { EntityStatuses } from "@backend/lib/enums.mjs";
import Image from "next/image";
import Link from "next/link";
import { getProductsList } from "@backend/lib/products-queries";
import { getStoreSettings } from "@backend/lib/settings";
import { formatPrice, effectivePriceCents, discountPercent } from "@backend/lib/money";
import { DeleteProductButton } from "@frontend/components/admin/delete-buttons";
import { AddProductModal, EditProductModal } from "@frontend/components/admin/add-product-modal";
import { PageHeader, StatusBadge } from "@frontend/components/admin/admin-ui";
import { BarcodeIcon } from "@frontend/components/admin/action-icons";

export const metadata = { title: "Products — Admin" };

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ stock?: string }>;
}) {
  const stock = (await searchParams).stock;
  const stockFilter = stock === "low" || stock === "out" ? stock : null;
  const [{ products, categories, brands }, settings] = await Promise.all([
    getProductsList({ stock: stockFilter }),
    getStoreSettings(),
  ]);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Products"
        subtitle={`${products.length} products in catalog`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/products/print-barcodes" className="btn btn-outline">
              <BarcodeIcon size={15} />
              Print barcodes
            </Link>
            <AddProductModal categories={categories} brands={brands} />
          </div>
        }
      />
      {stockFilter && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
          <p>
            {stockFilter === "out"
              ? "Active products with zero stock"
              : "Active products with 5 units or fewer"}
          </p>
          <Link href="/admin/products" className="font-semibold text-primary hover:underline">
            Clear filters
          </Link>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs font-semibold uppercase tracking-wider text-muted">
              <th className="px-5 py-3.5">Product</th>
              <th className="px-5 py-3.5">Category</th>
              <th className="px-5 py-3.5">Price</th>
              <th className="px-5 py-3.5">Stock</th>
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {products.map((p) => {
              const off = discountPercent(p.priceCents, p.salePriceCents);
              return (
                <tr key={p.id} className="transition-colors hover:bg-surface-2/50">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-surface-2">
                        <Image
                          src={p.images[0] ?? "/products/photo-spices.webp"}
                          alt=""
                          fill
                          sizes="44px"
                          className="object-contain p-1"
                        />
                      </span>
                      <div>
                        <p className="line-clamp-1 max-w-64 font-semibold">{p.name}</p>
                        {(p.sku || p.barcode) && (
                          <p className="font-mono text-[11px] text-muted">
                            {p.sku}
                            {p.sku && p.barcode ? " · " : ""}
                            {p.barcode}
                          </p>
                        )}
                        {p.brandName && <p className="text-xs text-muted">{p.brandName}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-muted">{p.categoryName}</td>
                  <td className="px-5 py-3.5">
                    <span className="font-semibold">
                      {formatPrice(
                        effectivePriceCents(p.priceCents, p.salePriceCents),
                        settings.currencySymbol,
                      )}
                    </span>
                    {off && (
                      <span className="ml-1.5 inline-flex items-center gap-1">
                        <span className="text-xs text-muted line-through">
                          {formatPrice(p.priceCents, settings.currencySymbol)}
                        </span>
                        <span className="badge-accent !px-1.5 !py-0 !text-[10px]">−{off}%</span>
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`badge ${p.stock === 0 ? "bg-accent/15 text-accent" : p.stock <= 5 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "badge-muted"}`}
                    >
                      {p.stock}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge
                      status={p.active ? EntityStatuses.Active : EntityStatuses.Inactive}
                    />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      {p.barcode && (
                        <Link
                          href={`/admin/products/print-barcodes?ids=${p.id}`}
                          aria-label={`Print barcode label for ${p.name}`}
                          title="Print barcode label"
                          className="btn-icon text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                        >
                          <BarcodeIcon size={16} />
                        </Link>
                      )}
                      <EditProductModal
                        product={{
                          id: p.id,
                          name: p.name,
                          nameBn: p.nameBn,
                          slug: p.slug,
                          sku: p.sku,
                          barcode: p.barcode,
                          description: p.description,
                          descriptionBn: p.descriptionBn,
                          priceCents: p.priceCents,
                          salePriceCents: p.salePriceCents,
                          costCents: p.costCents,
                          stock: p.stock,
                          weightGrams: p.weightGrams,
                          lengthMm: p.lengthMm,
                          widthMm: p.widthMm,
                          heightMm: p.heightMm,
                          categoryId: p.categoryId,
                          brandId: p.brandId,
                          flashSale: p.flashSale,
                          featured: p.featured,
                          active: p.active,
                          images: p.images,
                        }}
                        categories={categories}
                        brands={brands}
                      />
                      <DeleteProductButton id={p.id} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
