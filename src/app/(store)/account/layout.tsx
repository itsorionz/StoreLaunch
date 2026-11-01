import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@backend/lib/session";
import { getWalletBalance } from "@backend/lib/wallet";
import { getStoreSettings } from "@backend/lib/settings";
import { formatPrice } from "@backend/lib/money";
import { db } from "@backend/lib/db";
import { getInboxUnreadCount } from "@backend/lib/inbox";
import { getUnreadCounts } from "@backend/lib/chat";
import { getCartCount } from "@backend/lib/cart";
import { AccountBreadcrumb, AccountSidebar } from "@frontend/components/account/account-sidebar";

async function SidebarSection() {
  // Session decoding uses random IVs; keep the sidebar out of the prerender pass.
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/account");

  const [balance, settings, notifCount, inboxUnread, chatUnread, cartCount] = await Promise.all([
    getWalletBalance(user.id),
    getStoreSettings(),
    db.stockNotification.count({ where: { userId: user.id, notifiedAt: null } }),
    getInboxUnreadCount(user.id),
    getUnreadCounts({ id: user.id, role: user.role }),
    getCartCount(),
  ]);

  return (
    <AccountSidebar
      user={{ name: user.name || user.email || "Account", email: user.email || "" }}
      balanceText={formatPrice(balance, settings.currencySymbol)}
      notifCount={notifCount}
      inboxUnread={inboxUnread}
      chatUnread={chatUnread}
      cartCount={cartCount}
    />
  );
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full  px-4 py-6">
      <AccountBreadcrumb />
      <div className="mt-4 grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Suspense fallback={<div className="skeleton h-72 w-full rounded-2xl" />}>
          <SidebarSection />
        </Suspense>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
