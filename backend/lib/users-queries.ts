import "server-only";
import { db } from "./db";
import { EntityStatuses, Roles } from "./enums.mjs";

export interface UserSearchFilters {
  q: string;
  role?: string;
  status?: string;
}

/** /admin/users - accounts matching the filter form, plus recent status-change actors */
export async function searchUsers(filters: UserSearchFilters) {
  const where = {
    ...(filters.role ? { roles: { has: filters.role as typeof Roles.Admin } } : {}),
    ...(filters.status ? { active: filters.status === EntityStatuses.Active } : {}),
    ...(filters.q
      ? {
          OR: ["name", "email", "phone"].map((field) => ({
            [field]: { contains: filters.q, mode: "insensitive" as const },
          })),
        }
      : {}),
  };
  const [users, count, events] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 200,
      select: { id: true, name: true, email: true, phone: true, roles: true, active: true },
    }),
    db.user.count({ where }),
    db.accountStatusEvent.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const eventUserIds = events.flatMap((event) => (event.userId ? [event.userId] : []));
  const eventRiderIds = events.flatMap((event) => (event.riderId ? [event.riderId] : []));
  const [eventUsers, eventRiders] = await Promise.all([
    db.user.findMany({ where: { id: { in: eventUserIds } }, select: { id: true, name: true } }),
    db.rider.findMany({ where: { id: { in: eventRiderIds } }, select: { id: true, name: true } }),
  ]);
  return { users, count, events, eventUsers, eventRiders };
}
