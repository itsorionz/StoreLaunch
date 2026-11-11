import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@backend/lib/session";
import { getStoreSettings } from "@backend/lib/settings";
import { getReferralCode } from "@backend/lib/referrals";
import {
  countAccountReferrals,
  getAccountReferralRewards,
  listAccountReferralHistory,
} from "@backend/lib/account-queries";
import { formatPrice } from "@backend/lib/money";
import { ReferralShare, ReferralSteps } from "@frontend/components/account/referral-share";

export const metadata = { title: "Refer and Earn" };

async function ReferContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/account/refer");
  const [settings, code, count, rewards, history] = await Promise.all([
    getStoreSettings(),
    getReferralCode(user.id),
    countAccountReferrals(user.id),
    getAccountReferralRewards(user.id),
    listAccountReferralHistory(user.id),
  ]);
  const reward = formatPrice(settings.referralRewardCents, settings.currencySymbol);
  const link = new URL(
    "/register",
    process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  );
  link.searchParams.set("ref", code);
  const enabled = settings.referralEnabled && settings.referralRewardCents > 0;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Refer and Earn</h1>
      {enabled ? (
        <>
          <ReferralShare code={code} link={link.toString()} reward={reward} />
          <ReferralSteps reward={reward} />
        </>
      ) : (
        <div className="card p-6 text-sm text-muted">
          New referral invitations are currently paused. Previously accepted referrals keep their
          promised reward.
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { title: "Friends invited", value: String(count) },
          { title: "Awaiting first purchase", value: String(count - rewards._count) },
          {
            title: "Wallet rewards earned",
            value: formatPrice(rewards._sum.rewardCents ?? 0, settings.currencySymbol),
          },
        ].map((stat) => (
          <div key={stat.title} className="card p-5">
            <p className="text-xs text-muted">{stat.title}</p>
            <p className="mt-2 text-2xl font-bold text-primary">{stat.value}</p>
          </div>
        ))}
      </div>
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border p-5">
          <h2 className="font-semibold">Recent referrals</h2>
          <Link href="/account/wallet" className="text-sm font-medium text-primary hover:underline">
            View wallet
          </Link>
        </div>
        {history.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">
            Your friends&apos; signups and earned rewards will appear here.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {entry.rewardedAt ? "Reward added to wallet" : "Awaiting a qualifying purchase"}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Joined {entry.createdAt.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}
                  </p>
                </div>
                <span
                  className={
                    entry.rewardedAt ? "font-semibold text-primary" : "font-semibold text-muted"
                  }
                >
                  {formatPrice(
                    entry.rewardCents,
                    entry.currencyCode === settings.currencyCode
                      ? settings.currencySymbol
                      : entry.currencyCode + " ",
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function ReferPage() {
  return (
    <Suspense fallback={<div className="skeleton h-96 w-full rounded-2xl" />}>
      <ReferContent />
    </Suspense>
  );
}
