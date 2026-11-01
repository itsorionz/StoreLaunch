import Link from "next/link";
import { requireHrmPage } from "@backend/lib/session";
import { db } from "@backend/lib/db";
import { getDict } from "@frontend/i18n/dict";
import { StatusBadge } from "@frontend/components/admin/admin-ui";
import { Roles } from "@backend/lib/enums.mjs";

export const metadata = { title: "Employees — HRM" };

export default async function HrmEmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireHrmPage();
  const dict = await getDict();
  const parsed = searchParams instanceof Promise ? await searchParams : searchParams;
  const filters = parsed.q
    ? { q: parsed.q, role: parsed.role, status: parsed.status }
    : { q: "", role: "", status: "" };

  const where = {
    ...(filters.role ? { roles: { has: filters.role as "Customer" | "Admin" | "Rider" | "Support" | "Warehouse" | "Sales" | "Manager" } } : {}),
    ...(filters.status ? { active: filters.status === "Active" } : {}),
    ...(filters.q
      ? {
          OR: ["name", "email", "phone"].map((field) => ({
            [field]: { contains: filters.q, mode: "insensitive" as const },
          })),
        }
      : {}),
  };

  const [users, count] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 200,
      select: { id: true, name: true, email: true, phone: true, roles: true, active: true },
    }),
    db.user.count({ where }),
  ]);

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
                <td className="px-4 py-3">{user.roles.map((r) => r.replace(/([a-z])([A-Z])/g, "$1 $2")).join(", ")}</td>
                <td className="px-4 py-3">
                  <StatusBadge
                    status={user.active ? "Active" : "Inactive"}
                  />
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