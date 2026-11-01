import { Roles } from "@backend/lib/enums.mjs";
import { db } from "@backend/lib/db";
import { getStoreSettings } from "@backend/lib/settings";
import { formatPrice } from "@backend/lib/money";
import { WalletActions } from "@frontend/components/admin/wallet-actions";
import { shortText, validationFailure } from "@backend/lib/form-validation";

export const metadata = { title: "Wallets — Admin" };

export default async function AdminWalletsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const parsed = shortText.safeParse(q ?? "");
  if (!parsed.success)
    return (
      <div>
        <h1 className="text-2xl font-bold">Wallets</h1>
        <p role="alert" className="mt-4 text-sm text-accent">
          Search: {validationFailure(parsed.error).error}
        </p>
        <a href="/admin/wallets" className="btn-outline mt-4">
          Clear search
        </a>
      </div>
    );
  const query = parsed.data;
  const settings = await getStoreSettings();

  const customers = await db.user.findMany({
    where: {
      roles: { has: Roles.Customer },
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      wallet: { select: { balanceCents: true } },
    },
    take: 200,
  });

  const totalCents = customers.reduce((s, c) => s + (c.wallet?.balanceCents ?? 0), 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Wallets</h1>
          <p className="mt-1 text-sm text-muted">
            Gift or deduct customer wallet credit. Total held:{" "}
            <strong className="text-foreground">
              {formatPrice(totalCents, settings.currencySymbol)}
            </strong>
          </p>
        </div>
        <form method="get" className="flex flex-wrap gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search name or email…"
            className="input w-64"
          />
          <button type="submit" className="btn-outline h-9 px-4 text-sm">
            Search
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Gift / Deduct</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted">
                  No customers found.
                </td>
              </tr>
            )}
            {customers.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0 align-top">
                <td className="px-4 py-3">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted">{c.email}</p>
                </td>
                <td className="px-4 py-3 font-semibold">
                  {formatPrice(c.wallet?.balanceCents ?? 0, settings.currencySymbol)}
                </td>
                <td className="px-4 py-3">
                  <WalletActions userId={c.id} symbol={settings.currencySymbol} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
