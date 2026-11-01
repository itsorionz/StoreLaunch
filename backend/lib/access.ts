import { Roles } from "./enums.mjs";

/**
 * Portal role predicates, deliberately free of server-only imports: session.ts
 * wraps them with the session lookup, and the test suite asserts them directly
 * (importing next/navigation from a node:test process is not possible).
 */

/** Roles allowed into /admin — strictly the back-office owner. */
export const ADMIN_ROLES = [Roles.Admin] as const;

/** Roles allowed into /hrm — Admin plus the Manager who runs the HRM suite. */
export const HRM_ROLES = [Roles.Admin, Roles.Manager] as const;

function includesRole(roles: readonly string[], role: unknown): boolean {
  return typeof role === "string" && roles.includes(role);
}

export function isAdminRole(role: unknown): boolean {
  return includesRole(ADMIN_ROLES, role);
}

export function isHrmRole(role: unknown): boolean {
  return includesRole(HRM_ROLES, role);
}
