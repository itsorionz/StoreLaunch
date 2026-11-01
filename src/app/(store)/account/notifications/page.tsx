import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@backend/lib/session";
import { db } from "@backend/lib/db";
import { getDict } from "@frontend/i18n/dict";
import { RemoveNotificationButton } from "@frontend/components/products/remove-notification-button";

export const metadata = { title: "Notified Products" };

async function NotificationsContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/account/notifications");

  const [subs, dict] = await Promise.all([
    db.stockNotification.findMany({
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
      <h1 className="text-2xl font-bold">{dict.account.menuNotifications}</h1>

      {subs.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          {dict.account.notifyEmpty}
          <div className="mt-4">
            <Link href="/products" className="btn-outline btn-sm">
              {dict.account.myOrdersCta}
            </Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {subs.map((s) => (
            <li key={s.id} className="card flex flex-wrap items-center gap-4 p-4">
              <Link
                href={`/products/${s.product.slug}`}
                className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-2"
              >
                <img
                  src={s.product.images[0] ?? "/products/photo-spices.webp"}
                  alt={s.product.name}
                  className="h-full w-full object-contain p-1"
                />
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/products/${s.product.slug}`}
                  className="line-clamp-1 text-sm font-semibold hover:text-primary"
                >
                  {s.product.name}
                </Link>
                <p className="mt-0.5 text-xs text-muted">
                  {s.product.stock > 0 ? `${s.product.stock} in stock` : dict.account.notifyPending}
                  {s.notifiedAt &&
                    ` · ${dict.account.notifySent} ${s.notifiedAt.toLocaleDateString()}`}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  s.notifiedAt
                    ? "bg-primary/15 text-primary"
                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                }`}
              >
                {s.notifiedAt ? dict.account.notifySent : dict.account.notifyPending}
              </span>
              <RemoveNotificationButton productId={s.product.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 w-full rounded-2xl" />}>
      <NotificationsContent />
    </Suspense>
  );
}
