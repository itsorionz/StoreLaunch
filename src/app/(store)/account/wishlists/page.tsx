import { campaignPriceSelect, withCampaignPrice } from "@backend/lib/campaign-pricing";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@backend/lib/session";
import { db } from "@backend/lib/db";
import { getDict } from "@frontend/i18n/dict";
import { formatPrice } from "@backend/lib/money";
import { WishlistButton } from "@frontend/components/account/wishlist-button";

export const metadata = { title: "Wishlists" };

async function WishlistsContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/account/wishlists");

  const [items, dict] = await Promise.all([
    db.wishlist.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            priceCents: true,
            salePriceCents: true,
            campaignOffers: campaignPriceSelect,
            stock: true,
            images: true,
          },
        },
      },
    }),
    getDict(),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{dict.account.wishlists}</h1>

      {items.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          {dict.account.wishlistsEmpty}
          <div className="mt-4">
            <Link href="/products" className="btn-outline btn-sm">
              {dict.account.myOrdersCta}
            </Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map(({ product: rawProduct }) => {
            const product = withCampaignPrice(rawProduct);
            return (
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
                  <p className="mt-0.5 text-sm font-semibold text-primary">
                    {formatPrice(product.salePriceCents ?? product.priceCents)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {product.stock > 0 ? `${product.stock} in stock` : dict.account.notifyPending}
                  </p>
                </div>
                <WishlistButton productId={product.id} initial={true} size="sm" />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function WishlistsPage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 w-full rounded-2xl" />}>
      <WishlistsContent />
    </Suspense>
  );
}
