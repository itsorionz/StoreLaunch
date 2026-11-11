import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@backend/lib/session";
import { listOrdersWithPurchasedProducts } from "@backend/lib/account-queries";
import { getDict } from "@frontend/i18n/dict";

export const metadata = { title: "My Products" };

async function MyProductsContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/account/products");

  const [orders, dict] = await Promise.all([listOrdersWithPurchasedProducts(user.id), getDict()]);

  const map = new Map<
    string,
    { product: (typeof orders)[number]["items"][number]["product"]; qty: number; lastAt: Date }
  >();
  for (const order of orders) {
    for (const item of order.items) {
      const prev = map.get(item.productId);
      if (prev) {
        prev.qty += item.quantity;
        if (order.createdAt > prev.lastAt) prev.lastAt = order.createdAt;
      } else {
        map.set(item.productId, {
          product: item.product,
          qty: item.quantity,
          lastAt: order.createdAt,
        });
      }
    }
  }
  const products = [...map.values()].sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{dict.account.myProducts}</h1>

      {products.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          {dict.account.myProductsEmpty}
          <div className="mt-4">
            <Link href="/products" className="btn-outline btn-sm">
              {dict.account.myOrdersCta}
            </Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {products.map(({ product, qty, lastAt }) => (
            <li key={product.id} className="card flex flex-wrap items-center gap-4 p-4">
              <Link
                href={`/products/${product.slug}`}
                className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-2"
              >
                <img
                  src={product.images[0] ?? "/products/photo-spices.webp"}
                  alt={product.name}
                  className="h-full w-full object-contain p-1"
                />
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/products/${product.slug}`}
                  className="line-clamp-1 text-sm font-semibold hover:text-primary"
                >
                  {product.name}
                </Link>
                <p className="mt-0.5 text-xs text-muted">
                  {qty} ordered · {lastAt.toLocaleDateString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MyProductsPage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 w-full rounded-2xl" />}>
      <MyProductsContent />
    </Suspense>
  );
}
