import { db } from "@backend/lib/db";
import { ProductForm } from "@frontend/components/admin/product-form";

export const metadata = { title: "Add product — Admin" };

export default async function NewProductPage() {
  const [categories, brands] = await Promise.all([
    db.category.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true, nameBn: true, parentId: true },
    }),
    db.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, nameBn: true } }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Add product</h1>
      <ProductForm categories={categories} brands={brands} />
    </div>
  );
}
