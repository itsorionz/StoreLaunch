import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@backend/generated/prisma/client";
import { db } from "./db";
import { InboxCategories, OrderStatuses, Roles, WalletTransactionTypes } from "./enums.mjs";
import { MoneyLimits } from "./money-limits";
import { canonicalPhone } from "./phone";

export const normalizeReferralCode = (value: string) => value.trim().toUpperCase();

export async function getReferralCode(userId: string): Promise<string> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.referralCode) return user.referralCode;
    const code = "SL" + randomBytes(5).toString("hex").toUpperCase();
    await tx.user.update({ where: { id: userId }, data: { referralCode: code } });
    return code;
  });
}

/** Signup and attribution commit together; existing accounts cannot claim a referrer. */
export async function createReferredCustomer(input: {
  email: string;
  name: string;
  passwordHash: string;
  referralCode?: string;
}) {
  return db.$transaction(async (tx) => {
    const code = normalizeReferralCode(input.referralCode ?? "");
    if (code)
      await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtext('store-currency'))::text`;
    const settings = await tx.storeSettings.findUnique({ where: { singletonKey: 1 } });
    const referrer = code
      ? await tx.user.findFirst({
          where: { referralCode: code, active: true, roles: { has: Roles.Customer } },
          select: { id: true },
        })
      : null;
    if (code && (!referrer || !settings?.referralEnabled || settings.referralRewardCents <= 0))
      throw new Error("INVALID_REFERRAL");
    const user = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: input.passwordHash,
        roles: [Roles.Customer],
      },
    });
    if (referrer && settings) {
      await tx.referral.create({
        data: {
          referrerId: referrer.id,
          refereeId: user.id,
          rewardCents: settings.referralRewardCents,
          currencyCode: settings.currencyCode,
        },
      });
    }
    return user;
  });
}

/** Called in the delivery transaction; the referral row is the once-only reward claim. */
export async function rewardDeliveredReferral(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (
    !order ||
    order.status !== OrderStatuses.Delivered ||
    !order.paidAt ||
    order.totalCents <= 0 ||
    order.subtotalCents <= 0
  )
    return false;
  await tx.$queryRaw`SELECT id FROM "Referral" WHERE "refereeId" = ${order.userId} FOR UPDATE`;
  const referral = await tx.referral.findUnique({
    where: { refereeId: order.userId },
    include: {
      referrer: { select: { active: true, phone: true } },
      referee: { select: { active: true, phone: true } },
    },
  });
  if (
    !referral ||
    referral.rewardedAt ||
    !referral.referrer.active ||
    !referral.referee.active ||
    (referral.referrer.phone &&
      (canonicalPhone(referral.referrer.phone) === canonicalPhone(order.phone) ||
        (referral.referee.phone &&
          canonicalPhone(referral.referrer.phone) === canonicalPhone(referral.referee.phone)))) ||
    referral.currencyCode !== order.currencyCode ||
    order.createdAt < referral.createdAt
  )
    return false;
  await tx.wallet.upsert({
    where: { userId: referral.referrerId },
    create: { userId: referral.referrerId },
    update: {},
  });
  const credited = await tx.wallet.updateMany({
    where: {
      userId: referral.referrerId,
      balanceCents: { lte: MoneyLimits.maxStoredCents - referral.rewardCents },
    },
    data: { balanceCents: { increment: referral.rewardCents } },
  });
  // Keep an over-limit reward pending rather than blocking the customer's delivery.
  if (!credited.count) return false;
  const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: referral.referrerId } });
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      amountCents: referral.rewardCents,
      balanceAfterCents: wallet.balanceCents,
      type: WalletTransactionTypes.ReferralReward,
      orderId,
      note: "Reward for a referred customer's first completed purchase",
    },
  });
  await tx.referral.update({
    where: { id: referral.id },
    data: { rewardedAt: new Date(), qualifyingOrderId: orderId },
  });
  await tx.inboxMessage.createMany({
    data: {
      userId: referral.referrerId,
      category: InboxCategories.NOTIFICATION,
      title: "Referral reward received",
      body: "Your friend completed a purchase. Your referral reward has been added to your wallet.",
      href: "/account/wallet",
      sourceKey: "referral:" + referral.id,
    },
    skipDuplicates: true,
  });
  return true;
}
