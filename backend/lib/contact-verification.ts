import "server-only";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { ContactChannel } from "@backend/generated/prisma/client";
import { db } from "./db";
import { canonicalPhone } from "./phone";
import { sendSms } from "./sms";
import { sendEmail } from "./mail";
import { getVerificationTemplates, renderMessageTemplate } from "./message-templates";

const validityMinutes = 5;
const cooldownMilliseconds = 60_000;
const maxAttempts = 5;
const codeDigest = (id: string, code: string) =>
  createHash("sha256").update(`${id}:${code}`).digest("hex");

export type ContactTarget = { channel: ContactChannel; target: string };
export type ContactRequestResult =
  | { ok: true; challengeId: string; target: string }
  | {
      ok: false;
      code: "RATE_LIMIT" | "UNAVAILABLE" | "ALREADY_USED" | "SAME_CONTACT";
      wait?: number;
    };
export type ContactVerifyResult =
  | { ok: true; oldValue: string | null }
  | { ok: false; code: "INVALID_OTP" | "CONTACT_CHANGED" | "ALREADY_USED" };

function normalizeTarget(channel: ContactChannel, value: string): string | null {
  if (channel === ContactChannel.Email) {
    const email = value.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
  }
  const phone = canonicalPhone(value);
  return /^8801[3-9]\d{8}$/.test(phone) ? phone : null;
}

async function targetAlreadyUsed(
  channel: ContactChannel,
  target: string,
  exceptUserId: string,
): Promise<boolean> {
  if (channel === ContactChannel.Email) {
    return Boolean(
      await db.user.findFirst({
        where: { email: target, id: { not: exceptUserId } },
        select: { id: true },
      }),
    );
  }
  const users = await db.user.findMany({
    where: { phone: { not: null }, id: { not: exceptUserId } },
    select: { phone: true },
  });
  return users.some((user) => user.phone && canonicalPhone(user.phone) === target);
}

export async function requestContactVerification(
  channel: ContactChannel,
  rawTarget: string,
  userId: string,
): Promise<ContactRequestResult> {
  const target = normalizeTarget(channel, rawTarget);
  if (!target) return { ok: false, code: "UNAVAILABLE" };

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true },
  });
  if (!user) return { ok: false, code: "UNAVAILABLE" };
  const previousValue = channel === ContactChannel.Email ? user.email : user.phone;
  const oldNormalized = previousValue
    ? (normalizeTarget(channel, previousValue) ?? previousValue.trim().toLowerCase())
    : null;
  if (oldNormalized === target) return { ok: false, code: "SAME_CONTACT" };
  if (await targetAlreadyUsed(channel, target, userId)) return { ok: false, code: "ALREADY_USED" };

  const templates = await getVerificationTemplates();
  const code = String(randomInt(100000, 1000000));
  const challengeId = randomUUID();
  const prepared = await db.$transaction(async (tx) => {
    const lockKey = `${channel}:${target}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text`;
    await tx.contactVerificationOtp.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } },
    });
    const last = await tx.contactVerificationOtp.findFirst({
      where: {
        channel,
        createdAt: { gt: new Date(Date.now() - cooldownMilliseconds) },
        OR: [{ target }, { userId }],
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (last) {
      return {
        ok: false as const,
        wait: Math.ceil((cooldownMilliseconds - (Date.now() - last.createdAt.getTime())) / 1000),
      };
    }
    await tx.contactVerificationOtp.updateMany({
      where: { userId, channel, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await tx.contactVerificationOtp.create({
      data: {
        id: challengeId,
        userId,
        channel,
        target,
        previousValue,
        codeHash: codeDigest(challengeId, code),
        expiresAt: new Date(Date.now() + validityMinutes * 60_000),
      },
    });
    return { ok: true as const };
  });
  if (!prepared.ok) return { ok: false, code: "RATE_LIMIT", wait: prepared.wait };

  const templateValues = {
    code,
    minutes: validityMinutes,
    name: user.name,
    email: channel === ContactChannel.Email ? target : user.email,
    phone: channel === ContactChannel.Phone ? target : (user.phone ?? ""),
    storeName: templates.storeName,
  };
  const accepted =
    channel === ContactChannel.Email
      ? await sendEmail({
          to: target,
          subject: renderMessageTemplate(templates.emailSubject, templateValues),
          body: renderMessageTemplate(templates.emailBody, templateValues),
        })
      : await sendSms(target, renderMessageTemplate(templates.smsBody, templateValues));
  if (!accepted) {
    await db.contactVerificationOtp.updateMany({
      where: { id: challengeId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return { ok: false, code: "UNAVAILABLE" };
  }
  return { ok: true, challengeId, target };
}

export async function confirmContactVerification(input: {
  channel: ContactChannel;
  target: string;
  challengeId: string;
  code: string;
  userId: string;
}): Promise<ContactVerifyResult> {
  const target = normalizeTarget(input.channel, input.target);
  if (!target || !/^[0-9a-f-]{36}$/i.test(input.challengeId) || !/^\d{6}$/.test(input.code))
    return { ok: false, code: "INVALID_OTP" };

  return db.$transaction(async (tx) => {
    const lockKey = `${input.channel}:${target}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text`;
    await tx.$queryRaw`SELECT id FROM "Users" WHERE id = ${input.userId} FOR UPDATE`;
    const challenge = await tx.contactVerificationOtp.findFirst({
      where: {
        id: input.challengeId,
        userId: input.userId,
        channel: input.channel,
        target,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: maxAttempts },
      },
    });
    if (!challenge) return { ok: false, code: "INVALID_OTP" } as const;
    if (challenge.codeHash !== codeDigest(challenge.id, input.code)) {
      await tx.contactVerificationOtp.updateMany({
        where: { id: challenge.id, consumedAt: null, attempts: { lt: maxAttempts } },
        data: { attempts: { increment: 1 } },
      });
      return { ok: false, code: "INVALID_OTP" } as const;
    }

    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true, email: true, phone: true },
    });
    if (!user) return { ok: false, code: "INVALID_OTP" } as const;
    const previousValue = input.channel === ContactChannel.Email ? user.email : user.phone;
    if (previousValue !== challenge.previousValue)
      return { ok: false, code: "CONTACT_CHANGED" } as const;

    if (input.channel === ContactChannel.Email) {
      const collision = await tx.user.findUnique({
        where: { email: target },
        select: { id: true },
      });
      if (collision && collision.id !== user.id)
        return { ok: false, code: "ALREADY_USED" } as const;
    } else {
      const candidates = await tx.user.findMany({
        where: { id: { not: user.id }, phone: { not: null } },
        select: { phone: true },
      });
      if (
        candidates.some(
          (candidate) => candidate.phone && canonicalPhone(candidate.phone) === target,
        )
      )
        return { ok: false, code: "ALREADY_USED" } as const;
    }

    const claimed = await tx.contactVerificationOtp.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        attempts: { lt: maxAttempts },
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (!claimed.count) return { ok: false, code: "INVALID_OTP" } as const;
    if (input.channel === ContactChannel.Email) {
      await tx.user.update({ where: { id: user.id }, data: { email: target } });
    } else {
      await tx.user.update({ where: { id: user.id }, data: { phone: target } });
      await tx.rider.updateMany({ where: { userId: user.id }, data: { phone: target } });
    }
    return { ok: true, oldValue: previousValue } as const;
  });
}
