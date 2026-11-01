import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@backend/lib/session";
import { getWalletBalance, getWalletTransactions } from "@backend/lib/wallet";
import { getStoreSettings } from "@backend/lib/settings";
import { formatPrice } from "@backend/lib/money";
import { getDict } from "@frontend/i18n/dict";

export const metadata = { title: "My Wallet" };

const typeLabels: Record<string, string> = {
  ReferralReward: "Referral reward",
  GIFT: "Gift",
  ORDER_PAYMENT: "Order payment",
  REFUND: "Refund",
  ADJUSTMENT: "Adjustment",
};

async function WalletContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/account/wallet");

  const dict = await getDict();
  const [balance, txs, settings] = await Promise.all([
    getWalletBalance(user.id),
    getWalletTransactions(user.id),
    getStoreSettings(),
  ]);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="card p-6 lg:w-80 lg:shrink-0">
        <p className="text-sm text-muted">{dict.account.walletBalance}</p>
        <p className="mt-1 text-3xl font-bold text-primary">
          {formatPrice(balance, settings.currencySymbol)}
        </p>
        <Link
          href="/checkout"
          className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
        >
          {dict.account.walletUseAtCheckout} →
        </Link>
      </div>

      <div className="card min-w-0 flex-1 p-6">
        <h2 className="mb-4 font-bold">{dict.account.walletHistory}</h2>
        {txs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{dict.account.walletEmpty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {txs.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {typeLabels[t.type] ?? t.type}
                    {t.orderNumber && t.type !== "ReferralReward" && (
                      <span className="ml-2 text-xs text-muted">#{t.orderNumber}</span>
                    )}
                  </p>
                  {t.note && <p className="text-xs text-muted">{t.note}</p>}
                  <p className="text-xs text-muted">{t.createdAt.toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p
                    className={`font-semibold ${t.amountCents >= 0 ? "text-primary" : "text-accent"}`}
                  >
                    {t.amountCents >= 0 ? "+" : "−"}
                    {formatPrice(Math.abs(t.amountCents), settings.currencySymbol)}
                  </p>
                  <p className="text-xs text-muted">
                    {formatPrice(t.balanceAfterCents, settings.currencySymbol)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function WalletPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">My Wallet</h1>
      <Suspense fallback={<div className="skeleton h-64 w-full rounded-2xl" />}>
        <WalletContent />
      </Suspense>
    </div>
  );
}
