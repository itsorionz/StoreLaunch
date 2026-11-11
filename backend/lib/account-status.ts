import "server-only";
import { z } from "zod";
import type { Prisma } from "@backend/generated/prisma/client";
import { AccountStatusTargets, EntityStatuses, Roles } from "./enums.mjs";
import { recordId } from "./form-validation";
import { ACTIVE_ORDER_STATUSES } from "./order-status";
import { db } from "./db";
import { logger } from "./logger";

const log = logger.child({ scope: "account-status" });

export const accountStatusSchema = z.object({
  id: recordId,
  target: z.enum(AccountStatusTargets),
  status: z.enum(EntityStatuses),
  expectedStatus: z.enum(EntityStatuses),
});

// Serialize account/rider status changes with delivery assignment and rider edits.
export async function lockAccountStatus(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('account-status', 0))::text`;
}

export async function assertRiderCanDeactivate(tx: Prisma.TransactionClient, riderId: string) {
  if (await tx.order.count({ where: { riderId, status: { in: [...ACTIVE_ORDER_STATUSES] } } })) {
    throw new Error("Complete or reassign open deliveries before deactivating this rider");
  }
}

export async function setAccountStatus(
  actorId: string,
  input: z.infer<typeof accountStatusSchema>,
) {
  const parsed = accountStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid status change. Refresh and try again." };
  const { id, target, status, expectedStatus } = parsed.data;
  const active = status === EntityStatuses.Active;
  try {
    return await db.$transaction(async (tx) => {
      await lockAccountStatus(tx);
      const actor = await tx.user.findFirst({
        where: { id: actorId, active: true, roles: { has: Roles.Admin } },
      });
      if (!actor)
        return { ok: false, error: "Only an active administrator can change account status." };
      const account =
        target === AccountStatusTargets.User
          ? await tx.user.findUnique({ where: { id }, include: { riderProfile: true } })
          : await tx.rider.findUnique({ where: { id } });
      if (!account) return { ok: false, error: "Account not found." };
      if (account.active !== (expectedStatus === EntityStatuses.Active))
        return { ok: false, error: "Status changed. Refresh and try again." };
      if (account.active === active) return { ok: true };
      if (target === AccountStatusTargets.User) {
        const user = account as Prisma.UserGetPayload<{ include: { riderProfile: true } }>;
        if (!active && id === actorId)
          return { ok: false, error: "You cannot deactivate your own account." };
        if (
          !active &&
          user.roles.includes(Roles.Admin) &&
          (await tx.user.count({ where: { active: true, roles: { has: Roles.Admin } } })) <= 1
        ) {
          return { ok: false, error: "At least one active administrator must remain." };
        }
        if (!active && user.riderProfile) await assertRiderCanDeactivate(tx, user.riderProfile.id);
        await tx.user.update({ where: { id }, data: { active } });
        // Pending role choices cannot be used after a deactivation/reactivation cycle.
        if (!active)
          await tx.loginChallenge.updateMany({
            where: { userId: id, consumedAt: null },
            data: { consumedAt: new Date() },
          });
      } else {
        if (!active) await assertRiderCanDeactivate(tx, id);
        if (active) {
          const rider = account as Prisma.RiderGetPayload<object>;
          if (
            rider.userId &&
            !(await tx.user.findFirst({
              where: { id: rider.userId, active: true, roles: { has: Roles.Rider } },
            }))
          ) {
            return { ok: false, error: "Activate the linked account with a rider role first." };
          }
        }
        await tx.rider.update({ where: { id }, data: { active } });
      }
      await tx.accountStatusEvent.create({
        data: {
          ...(target === AccountStatusTargets.User ? { userId: id } : { riderId: id }),
          actorId: actor.id,
          actorName: actor.name,
          previousActive: account.active,
          active,
        },
      });
      return { ok: true };
    });
  } catch (error) {
    const expected = error instanceof Error && error.message.startsWith("Complete or reassign");
    if (expected) log.warn("setAccountStatus rejected", { error, target, id, active });
    else log.error("setAccountStatus failed", { error, target, id, active });
    return {
      ok: false,
      error: expected ? error.message : "Could not update status. Please try again.",
    };
  }
}
