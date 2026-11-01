import Link from "next/link";
import { requireServicePage } from "@backend/lib/session";
import { db } from "@backend/lib/db";
import { Roles } from "@backend/lib/enums.mjs";
import { userTextWhere } from "@backend/lib/search-filters";
import { getDict } from "@frontend/i18n/dict";
import { formatPrice } from "@backend/lib/money";
import { FilterPills, Pagination } from "@frontend/components/service/service-ui";

export const metadata = { title: "Customers — Support" };

const PAGE_SIZE = 20;

// Customer directory with the segments an agent actually uses: search by
// name/email/phone, plus wallet-balance and repeat-order shortcuts.
export default async function SupportCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; segment?: string; page?: string }>;
}) {
  await requireServicePage();
  const dict = await getDict();
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 120);
  const segment = params.segment === "wallet" ? "wallet" : "all";
  const rawPage = Number(params.page ?? "1");
  const requested = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  const base = {
    roles: { has: Roles.Customer },
    ...(q ? userTextWhere(q) : {}),
  };

  const countWhere = (candidate: string) =>
    candidate === "wallet"
      ? { AND: [base, { wallet: { is: { balanceCents: { gt: 0 } } } }] }
      : base;

  const total = await db.user.count({ where: countWhere(segment) });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requested, pages);

  const [customers, segmentCounts] = await Promise.all([
    db.user.findMany({
      where: countWhere(segment),
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        active: true,
        wallet: { select: { balanceCents: true } },
        _count: { select: { orders: true, chatConversations: true, supportTickets: true } },
      },
    }),
    Promise.all([
      db.user.count({ where: base }),
      db.user.count({ where: countWhere("wallet") }),
    ]).then(([all, wallet]) => ({ all, wallet })),
  ]);

  const linkWith = (patch: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = {
      q: q || undefined,
      segment: segment !== "all" ? segment : undefined,
      ...patch,
    };
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) if (value) search.set(key, value);
    const query = search.toString();
    return `/support/customers${query ? `?${query}` : ""}`;
  };

  return (
    <div className="animate-fade-up space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{dict.service.customers}</h1>
          <p className="mt-1 text-sm text-muted">
            Find a shopper and open their full history — orders, chats and tickets.
          </p>
        </div>
        <span className="badge badge-muted">
          {total} {dict.service.total}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterPills
          items={[
            {
              href: linkWith({ segment: undefined, page: undefined }),
              label: "All customers",
              active: segment === "all",
              count: segmentCounts.all,
            },
            {
              href: linkWith({ segment: "wallet", page: undefined }),
              label: "With wallet balance",
              active: segment === "wallet",
              count: segmentCounts.wallet,
            },
          ]}
        />
        <form method="get" action="/support/customers" className="flex gap-2">
          {segment !== "all" && <input type="hidden" name="segment" value={segment} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={120}
            placeholder="Name, email or phone…"
            className="input w-64"
          />
          <button type="submit" className="btn-outline shrink-0">
            {dict.common.search}
          </button>
        </form>
      </div>

      {customers.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">No customers found.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-semibold uppercase tracking-wider text-muted">
                <th className="px-5 py-3.5">Customer</th>
                <th className="px-5 py-3.5">Phone</th>
                <th className="px-5 py-3.5 text-right">Orders</th>
                <th className="px-5 py-3.5 text-right">Chats</th>
                <th className="px-5 py-3.5 text-right">Tickets</th>
                <th className="px-5 py-3.5 text-right">Wallet</th>
                <th className="px-5 py-3.5 text-right">Joined</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr
                  key={customer.id}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-2"
                >
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/support/customers/${customer.id}`}
                      className="block font-semibold transition-colors hover:text-primary"
                    >
                      {customer.name}
                      {!customer.active && <span className="ml-2 badge-accent">Inactive</span>}
                    </Link>
                    <span className="block max-w-56 truncate text-xs text-muted">
                      {customer.email}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-muted">{customer.phone ?? "—"}</td>
                  <td className="px-5 py-3.5 text-right">{customer._count.orders}</td>
                  <td className="px-5 py-3.5 text-right">{customer._count.chatConversations}</td>
                  <td className="px-5 py-3.5 text-right">{customer._count.supportTickets}</td>
                  <td className="px-5 py-3.5 text-right font-medium">
                    {customer.wallet && customer.wallet.balanceCents > 0
                      ? formatPrice(customer.wallet.balanceCents)
                      : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-right text-xs text-muted">
                    {customer.createdAt.toLocaleDateString("en-GB", {
                      timeZone: "Asia/Dhaka",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pages={pages} hrefFor={(next) => linkWith({ page: String(next) })} />
    </div>
  );
}
