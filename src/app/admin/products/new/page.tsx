import { listProductFormBrands, listProductFormCategories } from "@backend/lib/products-queries";
import { ProductForm } from "@frontend/components/admin/product-form";

export const metadata = { title: "Add product — Admin" };

export default async function NewProductPage() {
  const [categories, brands] = await Promise.all([
    listProductFormCategories(),
    listProductFormBrands(),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Add product</h1>
      <ProductForm categories={categories} brands={brands} />
    </div>
  );
}
