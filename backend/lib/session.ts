import { Roles } from "@backend/lib/enums.mjs";
import { isAdminRole, isHrmRole } from "./access";
import "server-only";
import { connection } from "next/server";
import { auth } from "./auth";
import { db } from "./db";
import { redirect } from "next/navigation";

export type CurrentUser = {
  id: string;
  role:
    | typeof Roles.Customer
    | typeof Roles.Admin
    | typeof Roles.Rider
    | typeof Roles.Support
    | typeof Roles.Warehouse
    | typeof Roles.Sales
    | typeof Roles.Manager;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Session decoding runs cryptographic randomness, which is unstable during
  // prerendering; only resolve it against a real request.
  await connection();
  const session = await auth();
  if (!session?.user?.id) return null;
  const account = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      roles: true,
      name: true,
      email: true,
      phone: true,
      active: true,
      riderProfile: { select: { active: true } },
    },
  });
  if (
    !account?.active ||
    !account.roles.includes(session.user.role) ||
    (session.user.role === Roles.Rider && !account.riderProfile?.active)
  )
    return null;
  return {
    id: session.user.id,
    role: session.user.role,
    name: account.name,
    email: account.email,
    phone: account.phone,
  };
}

export type RiderContext = {
  user: CurrentUser;
  rider: { id: string; name: string; phone: string; active: boolean };
};

export async function getRider(): Promise<RiderContext | null> {
  const user = await getCurrentUser();
  if (!user || user.role !== Roles.Rider) return null;
  const rider = await db.rider.findUnique({
    where: { userId: user.id },
    select: { id: true, name: true, phone: true, active: true },
  });
  if (!rider?.active) return null;
  return { user, rider };
}

export async function getService(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  if (!user || user.role !== Roles.Support) return null;
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) throw new Error("Unauthorized");
  return user;
}

export async function requireAdminPage(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/admin");
  if (!isAdminRole(user.role)) redirect("/");
  return user;
}

// HRM actions (employees, attendance, leave, payroll, performance, documents)
// are shared between Admin and Manager; everything outside /hrm stays Admin-only.
export async function requireHrm(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !isHrmRole(user.role)) throw new Error("Unauthorized");
  return user;
}

export async function requireHrmPage(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/hrm");
  if (!isHrmRole(user.role)) redirect("/");
  return user;
}

// Portal page guard: unauthenticated visitors go to login (returning here
// afterwards); authenticated non-agents leave the portal like everywhere else.
export async function requireServicePage(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/support");
  if (user.role !== Roles.Support) redirect("/");
  return user;
}

export async function getSalesPage(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== Roles.Sales) return null;
  return user;
}

export async function requireSalesPage(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/sales");
  if (user.role !== Roles.Sales) redirect("/");
  return user;
}

export async function getWarehousePage(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== Roles.Warehouse) return null;
  return user;
}

export async function requireWarehousePage(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/warehouse");
  if (user.role !== Roles.Warehouse) redirect("/");
  return user;
}

// Ops actions (receiving, pick/pack, stocktake, transfers) are shared between
// Admin and Warehouse per the permission matrix in docs/sales-representative-plan.md.
export async function requireOpsEditor(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || (user.role !== Roles.Admin && user.role !== Roles.Warehouse))
    throw new Error("Unauthorized");
  return user;
}
