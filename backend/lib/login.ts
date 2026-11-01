import { Roles } from "@backend/lib/enums.mjs";
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Role } from "@backend/generated/prisma/client";
import { db } from "./db";
import { verifyPhoneOtp } from "./otp";

export type LoginProof = { ticket: string; roles: Role[] };
export const LOGIN_ROLE_COOKIE = "sl_login_choice";

function availableRoles(user: {
  active: boolean;
  roles: Role[];
  riderProfile: { active: boolean } | null;
}): Role[] {
  if (!user.active) return [];
  return [...new Set(user.roles)].filter(
    (role) => role !== Roles.Rider || user.riderProfile?.active,
  );
}

function ticketHash(ticket: string): string {
  return createHash("sha256").update(ticket).digest("hex");
}

async function prepareVerifiedLogin(userId: string): Promise<LoginProof | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { riderProfile: { select: { active: true } } },
  });
  if (!user) return null;
  const roles = availableRoles(user);
  if (!roles.length) return null;
  const ticket = randomBytes(32).toString("hex");
  await db.loginChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.loginChallenge.create({
    data: { userId, tokenHash: ticketHash(ticket), expiresAt: new Date(Date.now() + 5 * 60_000) },
  });
  return { ticket, roles };
}

/** No roles are returned until the password has been checked. */
export async function prepareEmailLogin(
  email: string,
  password: string,
): Promise<LoginProof | null> {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user?.active || !(await bcrypt.compare(password, user.passwordHash))) return null;
  return prepareVerifiedLogin(user.id);
}

/** Consume the OTP once, then use a separate short-lived proof to choose a role. */
export async function preparePhoneLogin(phone: string, code: string): Promise<LoginProof | null> {
  const user = await verifyPhoneOtp(phone, code);
  return user ? prepareVerifiedLogin(user.id) : null;
}

export async function pendingLoginProof(ticket: unknown): Promise<LoginProof | null> {
  if (typeof ticket !== "string" || !/^[a-f0-9]{64}$/.test(ticket)) return null;
  const challenge = await db.loginChallenge.findUnique({
    where: { tokenHash: ticketHash(ticket) },
    include: { user: { include: { riderProfile: { select: { active: true } } } } },
  });
  if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date()) return null;
  const roles = availableRoles(challenge.user);
  return roles.length ? { ticket, roles } : null;
}

export async function abandonLoginProof(ticket: unknown): Promise<void> {
  if (typeof ticket !== "string" || !/^[a-f0-9]{64}$/.test(ticket)) return;
  await db.loginChallenge.updateMany({
    where: { tokenHash: ticketHash(ticket), consumedAt: null },
    data: { consumedAt: new Date() },
  });
}

export async function consumeLoginProof(ticket: unknown, role: unknown) {
  if (
    typeof ticket !== "string" ||
    !/^[a-f0-9]{64}$/.test(ticket) ||
    !(
      [
        Roles.Customer,
        Roles.Admin,
        Roles.Rider,
        Roles.Support,
        Roles.Warehouse,
        Roles.Sales,
        Roles.Manager,
      ] as readonly string[]
    ).includes(String(role))
  )
    return null;
  return db.$transaction(async (tx) => {
    const challenge = await tx.loginChallenge.findUnique({
      where: { tokenHash: ticketHash(ticket) },
      include: { user: { include: { riderProfile: { select: { active: true } } } } },
    });
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date()) return null;
    if (!availableRoles(challenge.user).includes(role as Role)) return null;
    const claimed = await tx.loginChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (!claimed.count) return null;
    return {
      id: challenge.user.id,
      email: challenge.user.email,
      name: challenge.user.name,
      role: role as Role,
      sessionVersion: challenge.user.sessionVersion,
    };
  });
}
