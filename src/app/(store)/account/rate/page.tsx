import { ReviewStatuses } from "@backend/lib/enums.mjs";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@backend/lib/session";
import { db } from "@backend/lib/db";
import { getDict } from "@frontend/i18n/dict";

export const metadata = { title: "Rate Us" };

async function RateContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/account/rate");

  const [agg, dict] = await Promise.all([
    db.review.aggregate({
      where: { status: ReviewStatuses.Approved },
      _avg: { rating: true },
      _count: true,
    }),
    getDict(),
  ]);

  const avg = agg._avg.rating ?? 0;
  const stars = Math.round(avg);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{dict.account.rateTitle}</h1>

      <div className="card p-6 text-center">
        <p className="text-sm font-medium text-muted">{dict.account.rateAvg}</p>
        <p className="mt-2 text-5xl font-bold">{avg.toFixed(1)}</p>
        <p className="mt-2 text-xl text-amber-500" aria-hidden>
          {"★".repeat(stars)}
          <span className="text-muted">{"★".repeat(5 - stars)}</span>
        </p>
        <p className="mt-1 text-sm text-muted">{agg._count} reviews</p>

        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/account/reviews" className="btn-primary">
            {dict.account.rateCta}
          </Link>
          <Link href="/products" className="btn-outline">
            {dict.account.rateBrowse}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RatePage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 w-full rounded-2xl" />}>
      <RateContent />
    </Suspense>
  );
}
