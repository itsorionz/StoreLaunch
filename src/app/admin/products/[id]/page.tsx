import { notFound } from "next/navigation";
import { db } from "@backend/lib/db";
import { ProductForm } from "@frontend/components/admin/product-form";
import { InventoryAdjustmentForm } from "@frontend/components/admin/inventory-adjustment-form";
import { randomUUID } from "node:crypto";

export const metadata = { title: "Edit product — Admin" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, categories, brands] = await Promise.all([
    db.product.findUnique({
      where: { id },
      include: { inventoryAdjustments: { orderBy: { createdAt: "desc" }, take: 20 } },
    }),
    db.category.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true, nameBn: true, parentId: true },
    }),
    db.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, nameBn: true } }),
  ]);
  if (!product) notFound();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Edit product</h1>
      <ProductForm
        product={{
          id: product.id,
          name: product.name,
          nameBn: product.nameBn,
          slug: product.slug,
          sku: product.sku,
          barcode: product.barcode,
          description: product.description,
          descriptionBn: product.descriptionBn,
          priceCents: product.priceCents,
          salePriceCents: product.salePriceCents,
          costCents: product.costCents,
          stock: product.stock,
          weightGrams: product.weightGrams,
          lengthMm: product.lengthMm,
          widthMm: product.widthMm,
          heightMm: product.heightMm,
          categoryId: product.categoryId,
          brandId: product.brandId,
          flashSale: product.flashSale,
          featured: product.featured,
          active: product.active,
          images: product.images,
        }}
        categories={categories}
        brands={brands}
      />
      <InventoryAdjustmentForm
        key={product.updatedAt.toISOString()}
        productId={product.id}
        stock={product.stock}
        updatedAt={product.updatedAt.toISOString()}
        requestKey={randomUUID()}
      />
      <section className="mt-6 rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-lg font-bold">Recent inventory adjustments</h2>
        {!product.inventoryAdjustments.length && (
          <p className="mt-2 text-sm text-muted">No manual adjustments recorded.</p>
        )}
        <ul className="mt-3 divide-y divide-border">
          {product.inventoryAdjustments.map((entry) => (
            <li key={entry.id} className="py-3 text-sm">
              <p className="font-semibold">
                {entry.delta > 0 ? "+" : ""}
                {entry.delta}: {entry.previousStock} to {entry.newStock}
              </p>
              <p className="whitespace-pre-wrap">{entry.reason}</p>
              <p className="text-xs text-muted">
                {entry.actorName} · {entry.createdAt.toISOString()}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
