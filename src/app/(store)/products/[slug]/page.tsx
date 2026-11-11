import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getProductBySlug, getRelatedProducts } from "@backend/lib/catalog";
import { getStoreSettings } from "@backend/lib/settings";
import { getCurrentUser } from "@backend/lib/session";
import { getStockNotification, getWishlistItem } from "@backend/lib/store-page-queries";
import { ProductRow } from "@frontend/components/products/product-row";
import { ProductDetailClient } from "@frontend/components/products/product-detail-client";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product" };
  return {
    title: product.name,
    description: product.description.slice(0, 160),
    openGraph: { title: product.name, images: product.images[0] ? [product.images[0]] : [] },
  };
}

async function ProductContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [product, settings, user] = await Promise.all([
    getProductBySlug(slug),
    getStoreSettings(),
    getCurrentUser(),
  ]);
  if (!product) notFound();

  const notifyEnabled = user ? !!(await getStockNotification(user.id, product.id)) : false;

  const wishlisted = user ? !!(await getWishlistItem(user.id, product.id)) : false;

  const related = await getRelatedProducts(product.category.slug, product.id);

  return (
    <>
      <ProductDetailClient
        product={product}
        notify={{ enabled: notifyEnabled, loggedIn: !!user }}
        wishlisted={wishlisted}
        settings={{
          currencySymbol: settings.currencySymbol,
          deliveryEstimate: settings.deliveryEstimate,
        }}
      />

      {related.length > 0 && (
        <div className="mt-12">
          <ProductRow
            title="You may also like"
            href={`/categories/${product.category.slug}`}
            products={related}
            currencySymbol={settings.currencySymbol}
            deliveryEstimate={settings.deliveryEstimate}
          />
        </div>
      )}
    </>
  );
}

export default async function ProductPage({ params }: Params) {
  return (
    <div className="w-full  px-4 py-6">
      <Suspense fallback={<div className="skeleton h-96 w-full rounded-2xl" />}>
        <ProductContent params={params} />
      </Suspense>
    </div>
  );
}
