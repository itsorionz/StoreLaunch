import Link from "next/link";
import { unstable_noStore } from "next/cache";
import { requireHrmPage } from "@backend/lib/session";
import { searchStaffAccounts } from "@backend/lib/hrm";
import { StatusBadge } from "@frontend/components/admin/admin-ui";

export const metadata = { title: "Employees — HRM" };

export default async function HrmEmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireHrmPage();
  unstable_noStore();
  const parsed = searchParams instanceof Promise ? await searchParams : searchParams;

  const { users } = await searchStaffAccounts(parsed.q, parsed.role, parsed.status);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          Staff accounts sharing this email or phone. Inactive accounts cannot sign in or use
          protected account features.
        </p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              {["Name", "Email / Phone", "Roles", "Status", "Action"].map((heading) => (
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
                <td className="px-4 py-3">
                  {user.roles.map((r) => r.replace(/([a-z])([A-Z])/g, "$1 $2")).join(", ")}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={user.active ? "Active" : "Inactive"} />
                </td>
                <td className="px-4 py-3">
                  <Link href={`/hrm/employees/${user.id}`} className="text-primary underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
