import Link from "next/link";
import { z } from "zod";
import { searchUsers } from "@backend/lib/users-queries";
import { requireAdminPage } from "@backend/lib/session";
import { EntityStatuses, Roles } from "@backend/lib/enums.mjs";
import { PageHeader, StatusBadge } from "@frontend/components/admin/admin-ui";
import { AccountStatusToggle } from "@frontend/components/admin/account-status-toggle";
import { AddUserModal, UserRolesModal } from "@frontend/components/admin/user-role-manager";

export const metadata = { title: "Accounts - Admin" };

function roleLabel(role: string): string {
  return role.replace(/([a-z])([A-Z])/g, "$1 $2");
}
const filtersSchema = z.object({
  q: z.string().trim().max(200).optional().default(""),
  role: z.enum(Roles).optional().or(z.literal("")),
  status: z.enum(EntityStatuses).optional().or(z.literal("")),
});

export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdminPage();
  const parsed = filtersSchema.safeParse(await searchParams);
  const filters = parsed.success ? parsed.data : { q: "", role: "", status: "" };
  const { users, count, events, eventUsers, eventRiders } = await searchUsers(filters);
  const names = new Map([...eventUsers, ...eventRiders].map((item) => [item.id, item.name]));
  return (
    <div className="space-y-5">
      <PageHeader
        title="Accounts"
        subtitle={`${count} matching accounts${count > users.length ? ` (showing newest ${users.length}; narrow your search)` : ""}`}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          Account status applies to every role sharing this email or phone. Inactive accounts cannot
          sign in or use protected account features. Manage rider availability separately in{" "}
          <Link href="/admin/riders" className="text-primary underline">
            Delivery
          </Link>
          .
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <AddUserModal />
        </div>
      </div>
      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="text-sm font-medium">
          Search
          <input
            name="q"
            defaultValue={filters.q}
            maxLength={200}
            placeholder="Name, email or phone"
            className="input mt-1"
          />
        </label>
        <label className="text-sm font-medium">
          Role
          <select name="role" defaultValue={filters.role} className="input mt-1">
            <option value="">All roles</option>
            {Object.values(Roles).map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Status
          <select name="status" defaultValue={filters.status} className="input mt-1">
            <option value="">All statuses</option>
            {Object.values(EntityStatuses).map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
        <button className="btn-primary">Filter</button>
        <Link href="/admin/users" className="btn-outline">
          Reset
        </Link>
      </form>
      {!parsed.success && (
        <p role="alert" className="text-sm text-accent">
          Invalid filters. Use a valid role, status and search of up to 200 characters.
        </p>
      )}
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              {["Name", "Email / Phone", "Roles", "Status", "Actions"].map((heading) => (
                <th key={heading} className="px-4 py-3">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!users.length && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted">
                  No accounts match these filters.
                </td>
              </tr>
            )}
            {users.map((user) => (
              <tr key={user.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{user.name}</td>
                <td className="px-4 py-3">
                  <p>{user.email}</p>
                  <p className="text-xs text-muted">{user.phone ?? "No phone"}</p>
                </td>
                <td className="px-4 py-3">{user.roles.map(roleLabel).join(", ")}</td>
                <td className="px-4 py-3">
                  <StatusBadge
                    status={user.active ? EntityStatuses.Active : EntityStatuses.Inactive}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <UserRolesModal
                      user={{ id: user.id, name: user.name, email: user.email, roles: user.roles }}
                      disabled={false}
                    />
                    <AccountStatusToggle
                      key={String(user.active)}
                      id={user.id}
                      active={user.active}
                      disabled={user.id === admin.id}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="card p-5">
        <h2 className="font-bold">Recent status changes</h2>
        <ul className="mt-3 divide-y divide-border">
          {!events.length && <li className="text-sm text-muted">No status changes yet.</li>}
          {events.map((event) => (
            <li key={event.id} className="py-2 text-sm">
              <p>
                <strong>
                  {names.get(event.userId ?? event.riderId ?? "") ?? "Archived account"}
                </strong>{" "}
                ({event.riderId ? "rider availability" : "account"}):{" "}
                {event.active ? EntityStatuses.Active : EntityStatuses.Inactive}
              </p>
              <p className="text-xs text-muted">
                By {event.actorName} ·{" "}
                {event.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })} BD
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
