import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Prisma } from "@backend/generated/prisma/client";
import { db } from "./db";
import { sendEmail } from "./mail";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const identifierHash = (value: string) => createHash("sha256").update(value).digest("hex");

async function allowRequest(tx: Prisma.TransactionClient, identifier: string) {
  const hash = identifierHash(identifier);
  await tx.authRecoveryRequest.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } },
  });
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${hash}, 0))::text`;
  const recent = await tx.authRecoveryRequest.findFirst({
    where: { identifierHash: hash, createdAt: { gt: new Date(Date.now() - 60_000) } },
  });
  if (recent) return false;
  await tx.authRecoveryRequest.create({ data: { identifierHash: hash } });
  return true;
}

export async function requestEmailPasswordReset(emailInput: string): Promise<void> {
  const email = emailInput.trim().toLowerCase();
  const allowed = await db.$transaction((tx) => allowRequest(tx, email));
  if (!allowed) return;
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, active: true },
  });
  if (!user?.active) return;
  const token = randomBytes(32).toString("base64url");
  await db.passwordResetChallenge.create({
    data: {
      userId: user.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    },
  });
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (!baseUrl) return;
  const link = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: user.email,
    subject: "Reset your password",
    body: `Use this link within 30 minutes to reset your password: ${link}\nIf you did not request this, ignore this message.`,
    html: `<p>Use this link within 30 minutes to reset your password.</p><p><a href="${link}">Reset password</a></p><p>If you did not request this, ignore this message.</p>`,
  });
}

export async function createPhoneResetTicket(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.passwordResetChallenge.create({
    data: { userId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 10 * 60_000) },
  });
  return token;
}

export async function completePasswordReset(token: string, password: string): Promise<boolean> {
  const hash = tokenHash(token);
  const passwordHash = await bcrypt.hash(password, 12);
  return db.$transaction(async (tx) => {
    const challenge = await tx.passwordResetChallenge.findUnique({ where: { tokenHash: hash } });
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date()) return false;
    const claimed = await tx.passwordResetChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (!claimed.count) return false;
    await tx.user.update({
      where: { id: challenge.userId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
    await tx.passwordResetChallenge.updateMany({
      where: { userId: challenge.userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return true;
  });
}
