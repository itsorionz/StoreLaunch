import { requireAdminPage } from "@backend/lib/session";
import { AccountStatusToggle } from "@frontend/components/admin/account-status-toggle";
import { StatusBadge } from "@frontend/components/admin/admin-ui";
import { EntityStatuses } from "@backend/lib/enums.mjs";
import { getCustomers } from "@backend/lib/admin-people-queries";
import { getStoreSettings } from "@backend/lib/settings";
import { formatPrice } from "@backend/lib/money";
import { AddCustomerModal } from "@frontend/components/admin/add-customer-modal";
import { PageHeader } from "@frontend/components/admin/admin-ui";

export const metadata = { title: "Customers — Admin" };

export default async function AdminCustomersPage() {
  const admin = await requireAdminPage();
  const [customers, settings] = await Promise.all([getCustomers(200), getStoreSettings()]);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Customers"
        subtitle={`${customers.length} customers`}
        action={<AddCustomerModal />}
      />
      <p className="mb-4 text-sm text-muted">
        Deactivating an account blocks access for all its roles. Existing orders and wallet balances
        are retained.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Orders</th>
              <th className="px-4 py-3">Wallet</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  No customers yet.
                </td>
              </tr>
            )}
            {customers.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-muted">{c.email}</td>
                <td className="px-4 py-3">{c._count.orders}</td>
                <td className="px-4 py-3 font-semibold">
                  {formatPrice(c.wallet?.balanceCents ?? 0, settings.currencySymbol)}
                </td>
                <td className="px-4 py-3 text-muted">{c.createdAt.toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <StatusBadge
                    status={c.active ? EntityStatuses.Active : EntityStatuses.Inactive}
                  />
                </td>
                <td className="px-4 py-3">
                  <AccountStatusToggle
                    key={String(c.active)}
                    id={c.id}
                    active={c.active}
                    disabled={c.id === admin.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
